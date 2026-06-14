from rest_framework import serializers
from expenses.models import (
    User, Group, GroupMembership, Expense, ExpenseParticipant,
    Settlement, ImportJob, ImportAnomaly, ImportReport
)

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'phone_number', 'qr_code_token')
        read_only_fields = ('id', 'qr_code_token')

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ('username', 'email', 'password')
        extra_kwargs = {
            'username': {
                'validators': []  # remove default UniqueValidator to allow claiming placeholder shells
            },
            'email': {
                'required': True,
                'allow_blank': False,
                'validators': []
            }
        }

    def validate_username(self, value):
        existing = User.objects.filter(username__iexact=value).first()
        if existing:
            # Only block if the user is already fully active
            if existing.is_active:
                raise serializers.ValidationError("This username is already taken.")
        return value

    def validate_email(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("This field is required.")
            
        from django.core.validators import validate_email
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            validate_email(value)
        except DjangoValidationError:
            raise serializers.ValidationError("Enter a valid email address.")
            
        existing = User.objects.filter(email__iexact=value).first()
        if existing:
            username = self.initial_data.get('username', '')
            if existing.username.lower() != username.lower() or existing.is_active:
                raise serializers.ValidationError("This email address is already registered.")
        return value

    def create(self, validated_data):
        username = validated_data['username']
        email = validated_data.get('email', '')
        password = validated_data['password']
        
        # Check if inactive placeholder user already exists
        user = User.objects.filter(username__iexact=username).first()
        if user:
            # Claim the user
            user.email = email
            user.set_password(password)
            user.save()
        else:
            # Create a new user
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password
            )
        return user

class GroupSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = Group
        fields = ('id', 'name', 'description', 'created_by', 'created_by_username', 'created_at')
        read_only_fields = ('id', 'created_by', 'created_at')

class GroupMembershipSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = GroupMembership
        fields = ('id', 'group', 'user', 'username', 'joined_at', 'left_at')
        read_only_fields = ('id',)

class ExpenseParticipantSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = ExpenseParticipant
        fields = ('id', 'user', 'username', 'amount', 'percentage', 'share', 'original_amount')
        read_only_fields = ('id',)

class ExpenseSerializer(serializers.ModelSerializer):
    payer_username = serializers.CharField(source='payer.username', read_only=True)
    participants = ExpenseParticipantSerializer(many=True, read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)

    class Meta:
        model = Expense
        fields = (
            'id', 'group', 'title', 'description', 'amount', 'currency',
            'payer', 'payer_username', 'date', 'split_type', 'converted_amount',
            'exchange_rate', 'participants', 'created_by', 'created_by_username',
            'created_at', 'updated_at'
        )
        read_only_fields = ('id', 'converted_amount', 'exchange_rate', 'created_by', 'created_at', 'updated_at')

class SettlementSerializer(serializers.ModelSerializer):
    payer_username = serializers.CharField(source='payer.username', read_only=True)
    receiver_username = serializers.CharField(source='receiver.username', read_only=True)

    class Meta:
        model = Settlement
        fields = (
            'id', 'group', 'payer', 'payer_username', 'receiver', 'receiver_username',
            'amount', 'currency', 'converted_amount', 'exchange_rate', 'date', 'note',
            'created_by', 'created_at'
        )
        read_only_fields = ('id', 'converted_amount', 'exchange_rate', 'created_by', 'created_at')

class ImportJobSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source='group.name', read_only=True)
    user_username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = ImportJob
        fields = (
            'id', 'group', 'group_name', 'user', 'user_username', 'file_name',
            'status', 'total_rows', 'successful_imports', 'failed_imports', 'created_at'
        )
        read_only_fields = ('id', 'user', 'file_name', 'status', 'total_rows', 'successful_imports', 'failed_imports', 'created_at')

class ImportAnomalySerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportAnomaly
        fields = (
            'id', 'import_job', 'row_number', 'raw_data', 'anomaly_type',
            'severity', 'description', 'status', 'resolution_action', 'resolved_at'
        )
        read_only_fields = ('id', 'import_job', 'row_number', 'raw_data', 'anomaly_type', 'severity', 'description', 'resolved_at')

class ImportReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportReport
        fields = ('id', 'import_job', 'report_data', 'created_at')
        read_only_fields = ('id', 'created_at')
