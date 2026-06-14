import os
import uuid
from decimal import Decimal
from datetime import datetime
from django.utils import timezone
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.db import transaction
from rest_framework import viewsets, status, permissions, generics
from rest_framework.response import Response
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework_simplejwt.tokens import RefreshToken

from expenses.models import (
    User, Group, GroupMembership, Expense,
    Settlement, ImportJob, ImportAnomaly, ImportReport, AuditLog
)
from expenses.serializers import (
    UserSerializer, RegisterSerializer, GroupSerializer,
    GroupMembershipSerializer, ExpenseSerializer, SettlementSerializer,
    ImportJobSerializer, ImportAnomalySerializer
)
from expenses.import_service import (
    process_csv_import, commit_resolved_import, get_exchange_rate,
    calculate_and_create_participants, auto_resolve_job_anomalies
)
from expenses.balance_service import (
    calculate_group_balances, get_simplified_settlements, get_ledger_explanation
)

# 1. Auth Views
from django.core.mail import send_mail

def send_otp_notification(user, otp, context="register"):
    """
    Sends the OTP code to the user's email.
    Also prints the OTP delivery to stdout console.
    """
    subject = "Verify your SplitFair Account" if context == "register" else "Resend: Verify your SplitFair Account"
    message = f"Hello {user.username},\n\nYour verification OTP code is: {otp}\n\nThis code will expire in 10 minutes."
    
    destination = user.email or "No email"
    print("\n" + "="*50 + f"\n[OTP DELIVERY] Username: {user.username} | Destination: {destination} | OTP: {otp}\n" + "="*50 + "\n")
    
    if user.email:
        if not getattr(settings, 'EMAIL_HOST_USER', None):
            print(f"[WARNING] EMAIL_HOST_USER is not configured in settings.py. Email was not sent. Check console/logs for OTP: {otp}")
        else:
            try:
                send_mail(
                    subject=subject,
                    message=message,
                    from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@splitfair.com'),
                    recipient_list=[user.email],
                    fail_silently=False,
                )
                print(f"Email successfully sent to {user.email}")
            except Exception as e:
                print(f"Failed to send email to {user.email}: {e}")

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = (permissions.AllowAny,)

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        user.is_verified = False
        user.is_active = False
        
        import random
        otp = str(random.randint(100000, 999999))
        user.otp_code = otp
        user.otp_created_at = timezone.now()
        user.save()
        
        send_otp_notification(user, otp, context="register")
        
        return Response({
            'username': user.username,
            'message': 'OTP sent successfully. Please verify to activate your account.'
        }, status=status.HTTP_201_CREATED)

class VerifyOTPView(generics.GenericAPIView):
    permission_classes = (permissions.AllowAny,)

    def post(self, request, *args, **kwargs):
        username = request.data.get('username')
        otp = request.data.get('otp')

        if not username or not otp:
            return Response({'detail': 'Username and OTP are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=status.HTTP_400_BAD_REQUEST)

        if user.is_verified:
            return Response({'detail': 'User is already verified.'}, status=status.HTTP_400_BAD_REQUEST)

        if not user.otp_code or not user.otp_created_at:
            return Response({'detail': 'No OTP code generated.'}, status=status.HTTP_400_BAD_REQUEST)

        from datetime import timedelta
        if timezone.now() - user.otp_created_at > timedelta(minutes=10):
            return Response({'detail': 'OTP has expired. Please request a new one.'}, status=status.HTTP_400_BAD_REQUEST)

        if user.otp_code != str(otp).strip():
            return Response({'detail': 'Invalid OTP.'}, status=status.HTTP_400_BAD_REQUEST)

        user.is_verified = True
        user.is_active = True
        user.otp_code = None
        user.otp_created_at = None
        user.save()

        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'token': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }
        }, status=status.HTTP_200_OK)

class ResendOTPView(generics.GenericAPIView):
    permission_classes = (permissions.AllowAny,)

    def post(self, request, *args, **kwargs):
        username = request.data.get('username')

        if not username:
            return Response({'detail': 'Username is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response({'detail': 'User not found.'}, status=status.HTTP_400_BAD_REQUEST)

        if user.is_verified:
            return Response({'detail': 'User is already verified.'}, status=status.HTTP_400_BAD_REQUEST)

        import random
        otp = str(random.randint(100000, 999999))
        user.otp_code = otp
        user.otp_created_at = timezone.now()
        user.save()

        send_otp_notification(user, otp, context="resend")

        return Response({
            'detail': 'OTP resent successfully.'
        }, status=status.HTTP_200_OK)


class UserProfileView(generics.RetrieveAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user

@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def check_user_exists(request):
    """Utility endpoint to verify username availability or existance."""
    username = request.query_params.get('username', '')
    exists = User.objects.filter(username=username).exists()
    return Response({'exists': exists})

# 2. Groups ViewSet
class GroupViewSet(viewsets.ModelViewSet):
    serializer_class = GroupSerializer

    def get_queryset(self):
        # Only show groups where the user is an active member
        return Group.objects.filter(memberships__user=self.request.user, memberships__left_at__isnull=True).distinct()

    def perform_create(self, serializer):
        group = serializer.save(created_by=self.request.user)
        # Automatically join the group
        GroupMembership.objects.create(
            group=group,
            user=self.request.user,
            joined_at=timezone.now()
        )
        AuditLog.objects.create(
            user=self.request.user,
            action='CREATE_GROUP',
            target_type='group',
            target_id=str(group.id),
            details={'name': group.name}
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.created_by != request.user:
            return Response({'error': 'Only the group creator can delete this group.'}, status=status.HTTP_403_FORBIDDEN)
        
        # Log audit
        AuditLog.objects.create(
            user=request.user,
            action='DELETE_GROUP',
            target_type='group',
            target_id=str(instance.id),
            details={'name': instance.name}
        )
        return super().destroy(request, *args, **kwargs)

# 3. Group Membership ViewSet
class GroupMembershipViewSet(viewsets.ModelViewSet):
    serializer_class = GroupMembershipSerializer

    def get_queryset(self):
        return GroupMembership.objects.filter(group__memberships__user=self.request.user, group__memberships__left_at__isnull=True).distinct()

    @action(detail=False, methods=['post'], url_path='add-by-username')
    def add_by_username(self, request):
        """Add a user to a group by username with an optional joined_at timestamp."""
        group_id = request.data.get('group')
        username = request.data.get('username')
        joined_at_str = request.data.get('joined_at')

        group = get_object_or_404(Group, id=group_id, memberships__user=request.user, memberships__left_at__isnull=True)
        invitee = get_object_or_404(User, username=username)

        # Parse joined_at or default to now
        if joined_at_str:
            try:
                joined_at = datetime.fromisoformat(joined_at_str.replace('Z', '+00:00'))
            except ValueError:
                joined_at = timezone.now()
        else:
            joined_at = timezone.now()

        # Check if already a member
        existing = GroupMembership.objects.filter(group=group, user=invitee).first()
        if existing:
            # If left, re-activate them by extending their record or creating a new membership row
            if existing.left_at:
                existing.left_at = None
                existing.joined_at = joined_at
                existing.save()
                return Response(GroupMembershipSerializer(existing).data, status=status.HTTP_200_OK)
            return Response({'error': 'User is already an active member of this group.'}, status=status.HTTP_400_BAD_REQUEST)

        membership = GroupMembership.objects.create(
            group=group,
            user=invitee,
            joined_at=joined_at
        )
        
        AuditLog.objects.create(
            user=request.user,
            action='ADD_GROUP_MEMBER',
            target_type='membership',
            target_id=str(membership.id),
            details={'group': group.name, 'member': invitee.username}
        )
        return Response(GroupMembershipSerializer(membership).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='leave')
    def leave_group(self, request, pk=None):
        """Mark left_at to historically archive a member's active status."""
        membership = self.get_object()
        group = membership.group
        
        is_self_leaving = (membership.user == request.user)
        is_creator_removing = (group.created_by == request.user)
        
        if not (is_self_leaving or is_creator_removing):
            return Response(
                {'error': 'You do not have permission to perform this action. Only the group creator can remove members, and members can only leave by themselves.'},
                status=status.HTTP_403_FORBIDDEN
            )
            
        membership.left_at = timezone.now()
        membership.save()
        
        action_name = 'REMOVE_GROUP_MEMBER' if is_creator_removing and not is_self_leaving else 'LEAVE_GROUP'
        AuditLog.objects.create(
            user=request.user,
            action=action_name,
            target_type='membership',
            target_id=str(membership.id),
            details={'group': group.name, 'member': membership.user.username}
        )
        return Response(GroupMembershipSerializer(membership).data)

# 4. Expense ViewSet
class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer

    def get_queryset(self):
        # Filter expenses in groups the user belongs to actively
        queryset = Expense.objects.filter(group__memberships__user=self.request.user, group__memberships__left_at__isnull=True).distinct()
        group_id = self.request.query_params.get('group_id')
        if group_id:
            queryset = queryset.filter(group_id=group_id)
        return queryset

    def create(self, request, *args, **kwargs):
        group_id = request.data.get('group')
        group = get_object_or_404(Group, id=group_id, memberships__user=request.user, memberships__left_at__isnull=True)
        
        payer_id = request.data.get('payer')
        payer = get_object_or_404(User, id=payer_id)
        
        title = request.data.get('title')
        amount = Decimal(str(request.data.get('amount')))
        currency = request.data.get('currency', 'INR').upper()
        date_str = request.data.get('date')
        exp_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        split_type = request.data.get('split_type', 'EQUAL').upper()
        
        # Verify payer and participants membership validity on this date
        participant_ids = request.data.get('participant_ids', [])
        if not participant_ids:
            return Response({'error': 'You must specify at least one participant.'}, status=status.HTTP_400_BAD_REQUEST)
            
        # Get rate and calculate converted amount in base currency (INR)
        rate = get_exchange_rate('INR', currency, exp_date)
        converted_amount = amount * rate
        
        # Create Expense instance
        with timezone.override('UTC'):
            expense = Expense.objects.create(
                group=group,
                title=title,
                description=request.data.get('description', ''),
                amount=amount,
                currency=currency,
                payer=payer,
                date=exp_date,
                split_type=split_type,
                converted_amount=converted_amount,
                exchange_rate=rate,
                created_by=request.user
            )

        # Parse custom splits if provided (e.g. details dict {user_id: val})
        custom_splits_raw = request.data.get('split_details', {})
        user_splits = {}
        for u_id, val in custom_splits_raw.items():
            user_splits[get_object_or_404(User, id=u_id)] = Decimal(str(val))
            
        participants = [get_object_or_404(User, id=uid) for uid in participant_ids]
        
        # Ensure payer and participants memberships are active on the expense date
        from expenses.import_service import ensure_membership_active
        for u in [payer] + participants:
            ensure_membership_active(u, group, exp_date, [])
            
        try:
            calculate_and_create_participants(expense, participants, split_type, user_splits)
        except ValueError as err:
            expense.delete()
            return Response({'error': str(err)}, status=status.HTTP_400_BAD_REQUEST)
            
        AuditLog.objects.create(
            user=request.user,
            action='CREATE_EXPENSE',
            target_type='expense',
            target_id=str(expense.id),
            details={'title': expense.title, 'amount': float(expense.amount), 'group': group.name}
        )
        
        return Response(ExpenseSerializer(expense).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        expense = self.get_object()
        if expense.payer != request.user:
            return Response(
                {'error': 'You do not have permission to edit this expense. Only the user who paid the expense can edit it.'},
                status=status.HTTP_403_FORBIDDEN
            )
        group = expense.group
        
        payer_id = request.data.get('payer', str(expense.payer.id))
        payer = get_object_or_404(User, id=payer_id)
        
        title = request.data.get('title', expense.title)
        amount_val = request.data.get('amount', expense.amount)
        amount = Decimal(str(amount_val))
        currency = request.data.get('currency', expense.currency).upper()
        
        date_str = request.data.get('date')
        if date_str:
            exp_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        else:
            exp_date = expense.date
            
        split_type = request.data.get('split_type', expense.split_type).upper()
        description = request.data.get('description', expense.description)
        
        # Get rate and calculate converted amount
        rate = get_exchange_rate('INR', currency, exp_date)
        converted_amount = amount * rate
        
        # Participants
        participant_ids = request.data.get('participant_ids')
        if participant_ids is None:
            participant_ids = list(expense.participants.values_list('user_id', flat=True))
            
        if not participant_ids:
            return Response({'error': 'You must specify at least one participant.'}, status=status.HTTP_400_BAD_REQUEST)
            
        participants = [get_object_or_404(User, id=uid) for uid in participant_ids]
        
        # Ensure payer and participants memberships are active on the expense date
        from expenses.import_service import ensure_membership_active
        for u in [payer] + participants:
            ensure_membership_active(u, group, exp_date, [])
            
        try:
            with transaction.atomic():
                # Update expense fields
                expense.title = title
                expense.description = description
                expense.amount = amount
                expense.currency = currency
                expense.payer = payer
                expense.date = exp_date
                expense.split_type = split_type
                expense.converted_amount = converted_amount
                expense.exchange_rate = rate
                expense.save()
                
                # Delete old participants
                expense.participants.all().delete()
                
                # Parse custom splits if provided
                custom_splits_raw = request.data.get('split_details', {})
                user_splits = {}
                for u_id, val in custom_splits_raw.items():
                    user_splits[get_object_or_404(User, id=u_id)] = Decimal(str(val))
                    
                calculate_and_create_participants(expense, participants, split_type, user_splits)
        except ValueError as err:
            return Response({'error': str(err)}, status=status.HTTP_400_BAD_REQUEST)
            
        AuditLog.objects.create(
            user=request.user,
            action='UPDATE_EXPENSE',
            target_type='expense',
            target_id=str(expense.id),
            details={'title': expense.title, 'amount': float(expense.amount), 'group': group.name}
        )
        
        return Response(ExpenseSerializer(expense).data)

    def destroy(self, request, *args, **kwargs):
        expense = self.get_object()
        if expense.payer != request.user:
            return Response(
                {'error': 'You do not have permission to delete this expense. Only the user who paid the expense can delete it.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        AuditLog.objects.create(
            user=request.user,
            action='DELETE_EXPENSE',
            target_type='expense',
            target_id=str(expense.id),
            details={'title': expense.title, 'amount': float(expense.amount), 'group': expense.group.name}
        )
        return super().destroy(request, *args, **kwargs)

# 5. Settlement ViewSet
class SettlementViewSet(viewsets.ModelViewSet):
    serializer_class = SettlementSerializer

    def get_queryset(self):
        queryset = Settlement.objects.filter(group__memberships__user=self.request.user, group__memberships__left_at__isnull=True).distinct()
        group_id = self.request.query_params.get('group_id')
        if group_id:
            queryset = queryset.filter(group_id=group_id)
        return queryset

    def create(self, request, *args, **kwargs):
        group_id = request.data.get('group')
        group = get_object_or_404(Group, id=group_id, memberships__user=request.user, memberships__left_at__isnull=True)
        
        payer = get_object_or_404(User, id=request.data.get('payer'))
        receiver = get_object_or_404(User, id=request.data.get('receiver'))
        amount = Decimal(str(request.data.get('amount')))
        currency = request.data.get('currency', 'INR').upper()
        date_str = request.data.get('date')
        sett_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        
        # Calculate conversion
        rate = get_exchange_rate('INR', currency, sett_date)
        converted_amount = amount * rate
        
        # Ensure payer and receiver memberships are active on settlement date
        from expenses.import_service import ensure_membership_active
        for u in [payer, receiver]:
            ensure_membership_active(u, group, sett_date, [])
            
        settlement = Settlement.objects.create(
            group=group,
            payer=payer,
            receiver=receiver,
            amount=amount,
            currency=currency,
            converted_amount=converted_amount,
            exchange_rate=rate,
            date=sett_date,
            note=request.data.get('note', ''),
            created_by=request.user
        )
        
        AuditLog.objects.create(
            user=request.user,
            action='RECORD_SETTLEMENT',
            target_type='settlement',
            target_id=str(settlement.id),
            details={'payer': payer.username, 'receiver': receiver.username, 'amount': float(amount)}
        )
        
        return Response(SettlementSerializer(settlement).data, status=status.HTTP_201_CREATED)

# 6. Balances and Ledger Explanation Views
@api_view(['GET'])
def get_group_balances_summary(request, group_id):
    """
    Returns the balance summary of the group:
    - User individual summaries (owed, receivable, net)
    - Net direct debts
    - Greedy Simplified Settlements ("Who pays whom")
    """
    group = get_object_or_404(Group, id=group_id, memberships__user=request.user, memberships__left_at__isnull=True)
    
    balances_data = calculate_group_balances(group)
    
    # Map user IDs to usernames and details
    memberships = group.memberships.select_related('user').all()
    user_map = {m.user_id: m.user for m in memberships}
    
    # Format direct debts
    formatted_direct_debts = []
    for debtor_id, debts in balances_data['direct_debts'].items():
        if debtor_id not in user_map:
            continue
        debtor_name = user_map[debtor_id].username
        for creditor_id, amount in debts.items():
            if creditor_id not in user_map or amount <= 0:
                continue
            creditor_name = user_map[creditor_id].username
            formatted_direct_debts.append({
                'debtor_id': str(debtor_id),
                'debtor': debtor_name,
                'creditor_id': str(creditor_id),
                'creditor': creditor_name,
                'amount': float(amount)
            })
            
    # Compute simplified path
    simplified_path = get_simplified_settlements(balances_data['net_balances'], user_map)
    
    # Format user summaries
    formatted_summaries = {}
    for u_id, summary in balances_data['user_summaries'].items():
        if u_id not in user_map:
            continue
        formatted_summaries[user_map[u_id].username] = {
            'user_id': str(u_id),
            'owed': float(summary['owed']),
            'receivable': float(summary['receivable']),
            'net': float(summary['net'])
        }
        
    return Response({
        'group_name': group.name,
        'summaries': formatted_summaries,
        'direct_debts': formatted_direct_debts,
        'simplified_path': simplified_path
    })

@api_view(['GET'])
def get_ledger_explanation_view(request):
    """
    Returns an itemized trace ledger explaining the balance between user_a and user_b.
    Query params: group_id, user_a (username or ID), user_b (username or ID)
    """
    group_id = request.query_params.get('group_id')
    user_a_param = request.query_params.get('user_a')
    user_b_param = request.query_params.get('user_b')
    
    group = get_object_or_404(Group, id=group_id, memberships__user=request.user, memberships__left_at__isnull=True)
    
    # Resolve users
    if '-' in user_a_param:  # UUID format check
        user_a = get_object_or_404(User, id=user_a_param)
    else:
        user_a = get_object_or_404(User, username=user_a_param)
        
    if '-' in user_b_param:
        user_b = get_object_or_404(User, id=user_b_param)
    else:
        user_b = get_object_or_404(User, username=user_b_param)
        
    ledger = get_ledger_explanation(group, user_a, user_b)
    
    return Response({
        'user_a': user_a.username,
        'user_b': user_b.username,
        'ledger': ledger
    })

# 7. Import Module Views
class CSVUploadView(generics.CreateAPIView):
    serializer_class = ImportJobSerializer

    def post(self, request, *args, **kwargs):
        group = get_object_or_404(Group, id=group_id, memberships__user=request.user, memberships__left_at__isnull=True)
        
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({'error': 'No file uploaded.'}, status=status.HTTP_400_BAD_REQUEST)
            
        if not file_obj.name.endswith('.csv'):
            return Response({'error': 'Uploaded file is not a CSV.'}, status=status.HTTP_400_BAD_REQUEST)

        # Save file locally inside media/imports
        file_dir = os.path.join(settings.BASE_DIR, 'media', 'imports')
        os.makedirs(file_dir, exist_ok=True)
        file_path = os.path.join(file_dir, f"job_{uuid.uuid4().hex}_{file_obj.name}")
        
        with open(file_path, 'wb+') as destination:
            for chunk in file_obj.chunks():
                destination.write(chunk)
                
        # Create Job record
        import_job = ImportJob.objects.create(
            group=group,
            user=request.user,
            file_name=file_path,
            status='PENDING_REVIEW'
        )
        
        # Parse and populate anomalies synchronously
        try:
            process_csv_import(import_job.id)
            
            AuditLog.objects.create(
                user=request.user,
                action='UPLOAD_CSV_IMPORT',
                target_type='import_job',
                target_id=str(import_job.id),
                details={'file_name': file_obj.name, 'group': group.name}
            )
            
            return Response(ImportJobSerializer(import_job).data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response({'error': f"Failed parsing CSV: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ImportJobViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ImportJobSerializer

    def get_queryset(self):
        return ImportJob.objects.filter(group__memberships__user=self.request.user, group__memberships__left_at__isnull=True).distinct()

class AnomalyViewSet(viewsets.ModelViewSet):
    serializer_class = ImportAnomalySerializer

    def get_queryset(self):
        return ImportAnomaly.objects.filter(import_job__group__memberships__user=self.request.user, import_job__group__memberships__left_at__isnull=True).distinct()

    def get_serializer_class(self):
        return ImportAnomalySerializer

    # Allow users to patch action and status
    def update(self, request, *args, **kwargs):
        anomaly = self.get_object()
        action_val = request.data.get('resolution_action')
        
        # update status and resolution action
        anomaly.resolution_action = action_val
        anomaly.status = 'RESOLVED' if action_val else 'PENDING'
        anomaly.resolved_at = timezone.now() if action_val else None
        anomaly.save()
        
        return Response(ImportAnomalySerializer(anomaly).data)

@api_view(['POST'])
def commit_import_job_view(request, job_id):
    """Commits a resolved import job, applying all rows to database."""
    import_job = get_object_or_404(ImportJob, id=job_id, group__memberships__user=request.user, group__memberships__left_at__isnull=True)
    
    try:
        report = commit_resolved_import(import_job.id, request.user)
        return Response({
            'message': 'CSV data successfully imported.',
            'report': report
        })
    except ValueError as err:
        return Response({'error': str(err)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'error': f"Commit failed: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
def get_import_report(request, job_id):
    """Fetches the final import report generated for a completed job."""
    import_job = get_object_or_404(ImportJob, id=job_id, group__memberships__user=request.user, group__memberships__left_at__isnull=True)
    report = get_object_or_404(ImportReport, import_job=import_job)
    return Response(report.report_data)

@api_view(['POST'])
def auto_resolve_import_anomalies_view(request, job_id):
    """Intelligently resolves all pending anomalies for an import job automatically."""
    import_job = get_object_or_404(ImportJob, id=job_id, group__memberships__user=request.user, group__memberships__left_at__isnull=True)
    try:
        count = auto_resolve_job_anomalies(import_job.id)
        return Response({
            'message': f'Successfully auto-resolved {count} anomalies.',
            'resolved_count': count
        })
    except Exception as e:
        return Response({'error': f"Auto-resolution failed: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
