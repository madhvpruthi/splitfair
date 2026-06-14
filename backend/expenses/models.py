import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser

class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    qr_code_token = models.CharField(max_length=255, unique=True, null=True, blank=True)
    phone_number = models.CharField(max_length=20, null=True, blank=True, unique=True)
    
    # OTP verification fields
    is_verified = models.BooleanField(default=True)
    otp_code = models.CharField(max_length=6, null=True, blank=True)
    otp_created_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if self.phone_number == "":
            self.phone_number = None
        if not self.qr_code_token:
            self.qr_code_token = f"user_{self.username}_{uuid.uuid4().hex[:8]}"
        super().save(*args, **kwargs)

    def __str__(self):
        return self.username

class Group(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='created_groups')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class GroupMembership(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='group_memberships')
    joined_at = models.DateTimeField()
    left_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['group', 'user', 'joined_at'], name='unique_membership')
        ]

    def __str__(self):
        return f"{self.user.username} in {self.group.name}"

class Expense(models.Model):
    SPLIT_TYPES = (
        ('EQUAL', 'Equal'),
        ('UNEQUAL', 'Unequal'),
        ('PERCENTAGE', 'Percentage'),
        ('SHARE', 'Share'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='expenses')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)  # Original amount
    currency = models.CharField(max_length=3, default='INR')        # e.g., 'INR', 'USD'
    payer = models.ForeignKey(User, on_delete=models.PROTECT, related_name='paid_expenses')
    date = models.DateField()
    split_type = models.CharField(max_length=20, choices=SPLIT_TYPES, default='EQUAL')
    
    # Currency conversion fields
    converted_amount = models.DecimalField(max_digits=12, decimal_places=2)  # Converted to base currency (INR)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=1.0)
    
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='entered_expenses')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} ({self.amount} {self.currency})"

class ExpenseParticipant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name='participants')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='expense_participations')
    
    # Amount owed in converted base currency (INR)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    # Split details
    percentage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    share = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    # Amount owed in original currency
    original_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return f"{self.user.username} owes {self.amount} for {self.expense.title}"

class Settlement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='settlements')
    payer = models.ForeignKey(User, on_delete=models.PROTECT, related_name='paid_settlements')
    receiver = models.ForeignKey(User, on_delete=models.PROTECT, related_name='received_settlements')
    amount = models.DecimalField(max_digits=12, decimal_places=2)  # Original amount settled
    currency = models.CharField(max_length=3, default='INR')
    
    # Conversion fields
    converted_amount = models.DecimalField(max_digits=12, decimal_places=2)  # Base currency (INR)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=1.0)
    
    date = models.DateField()
    note = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.payer.username} settled {self.amount} {self.currency} to {self.receiver.username}"

class ExchangeRate(models.Model):
    base_currency = models.CharField(max_length=3)    # e.g., 'INR'
    target_currency = models.CharField(max_length=3)  # e.g., 'USD'
    rate = models.DecimalField(max_digits=18, decimal_places=6)
    date = models.DateField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['base_currency', 'target_currency', 'date'], name='unique_exchange_rate')
        ]

    def __str__(self):
        return f"1 {self.target_currency} = {self.rate} {self.base_currency} on {self.date}"

class ImportJob(models.Model):
    STATUS_CHOICES = (
        ('PENDING_REVIEW', 'Pending Review'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='import_jobs')
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    file_name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING_REVIEW')
    total_rows = models.IntegerField(default=0)
    successful_imports = models.IntegerField(default=0)
    failed_imports = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Import job {self.id} for {self.group.name}"

class ImportAnomaly(models.Model):
    ANOMALY_STATUS = (
        ('PENDING', 'Pending Resolution'),
        ('APPROVED', 'Approved (Applied)'),
        ('RESOLVED', 'Resolved (Custom Fix)'),
        ('IGNORED', 'Ignored (Row Skipped)'),
    )
    SEVERITY_CHOICES = (
        ('ERROR', 'Error'),
        ('WARNING', 'Warning'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    import_job = models.ForeignKey(ImportJob, on_delete=models.CASCADE, related_name='anomalies')
    row_number = models.IntegerField()
    raw_data = models.JSONField()
    anomaly_type = models.CharField(max_length=100) # e.g. 'DUPLICATE', 'MEMBERSHIP_VIOLATION'
    severity = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default='ERROR')
    description = models.TextField()
    status = models.CharField(max_length=20, choices=ANOMALY_STATUS, default='PENDING')
    resolution_action = models.CharField(max_length=255, null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Row {self.row_number} anomaly in job {self.import_job_id}"

class ImportReport(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    import_job = models.ForeignKey(ImportJob, on_delete=models.CASCADE, related_name='reports')
    report_data = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Report for job {self.import_job_id}"

class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=100) # e.g. 'CREATE_EXPENSE'
    target_type = models.CharField(max_length=100) # e.g. 'expense'
    target_id = models.CharField(max_length=100, null=True, blank=True)
    details = models.JSONField(default=dict)
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.action} by {self.user.username if self.user else 'System'} on {self.timestamp}"
