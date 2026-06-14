from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from expenses.models import (
    User, Group, GroupMembership, Expense, 
    ExpenseParticipant, Settlement, ExchangeRate, 
    ImportJob, ImportAnomaly, ImportReport, AuditLog
)

class CustomUserAdmin(UserAdmin):
    list_display = UserAdmin.list_display + ('phone_number', 'is_verified')
    fieldsets = UserAdmin.fieldsets + (
        ('Custom Auth Details', {'fields': ('phone_number', 'is_verified', 'otp_code', 'qr_code_token')}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Custom Auth Details', {'fields': ('phone_number', 'is_verified')}),
    )

admin.site.register(User, CustomUserAdmin)

# Register other models
admin.site.register(Group)
admin.site.register(GroupMembership)
admin.site.register(Expense)
admin.site.register(ExpenseParticipant)
admin.site.register(Settlement)
admin.site.register(ExchangeRate)
admin.site.register(ImportJob)
admin.site.register(ImportAnomaly)
admin.site.register(ImportReport)
admin.site.register(AuditLog)
