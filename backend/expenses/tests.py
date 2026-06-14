import tempfile
import csv
from decimal import Decimal
from datetime import date, datetime
from django.test import TestCase
from django.utils import timezone
from expenses.models import (
    User, Group, GroupMembership, Expense, ExpenseParticipant,
    Settlement, ExchangeRate, ImportJob, ImportAnomaly, ImportReport
)
from expenses.import_service import (
    detect_anomalies_for_row, process_csv_import, commit_resolved_import,
    get_exchange_rate, calculate_and_create_participants,
    clean_row_data, parse_split_details, parse_flexible_date,
    auto_resolve_job_anomalies
)
from expenses.balance_service import (
    calculate_group_balances, get_simplified_settlements, get_ledger_explanation
)

class BalanceEngineTestCase(TestCase):
    def setUp(self):
        # Create users
        self.aisha = User.objects.create_user(username='Aisha', email='aisha@example.com', password='password123')
        self.rohan = User.objects.create_user(username='Rohan', email='rohan@example.com', password='password123')
        self.priya = User.objects.create_user(username='Priya', email='priya@example.com', password='password123')
        
        # Create group
        self.group = Group.objects.create(name='Flatmates', created_by=self.aisha)
        
        # Add memberships
        self.m_aisha = GroupMembership.objects.create(
            group=self.group, user=self.aisha, joined_at=timezone.make_aware(datetime(2026, 1, 1))
        )
        self.m_rohan = GroupMembership.objects.create(
            group=self.group, user=self.rohan, joined_at=timezone.make_aware(datetime(2026, 1, 1))
        )
        self.m_priya = GroupMembership.objects.create(
            group=self.group, user=self.priya, joined_at=timezone.make_aware(datetime(2026, 1, 1))
        )

    def test_equal_split_calculation(self):
        # Aisha pays 300 INR for dinner, split equally between all three
        expense = Expense.objects.create(
            group=self.group,
            title='Dinner',
            amount=Decimal('300.00'),
            currency='INR',
            payer=self.aisha,
            date=date(2026, 1, 10),
            split_type='EQUAL',
            converted_amount=Decimal('300.00'),
            exchange_rate=Decimal('1.00'),
            created_by=self.aisha
        )
        
        participants = [self.aisha, self.rohan, self.priya]
        calculate_and_create_participants(expense, participants, 'EQUAL', {})
        
        balances = calculate_group_balances(self.group)
        summaries = balances['user_summaries']
        
        # Aisha paid 300, owes 100, net should be +200
        self.assertEqual(summaries[self.aisha.id]['net'], Decimal('200.00'))
        # Rohan owes 100, net should be -100
        self.assertEqual(summaries[self.rohan.id]['net'], Decimal('-100.00'))
        # Priya owes 100, net should be -100
        self.assertEqual(summaries[self.priya.id]['net'], Decimal('-100.00'))

        # Check direct debts
        # Rohan owes Aisha 100
        self.assertEqual(balances['direct_debts'][self.rohan.id][self.aisha.id], Decimal('100.00'))
        # Priya owes Aisha 100
        self.assertEqual(balances['direct_debts'][self.priya.id][self.aisha.id], Decimal('100.00'))

    def test_membership_timelines(self):
        # Create a new user Sam who joins late
        sam = User.objects.create_user(username='Sam', email='sam@example.com', password='password123')
        
        # Sam joins on April 15
        sam_joined_date = timezone.make_aware(datetime(2026, 4, 15))
        m_sam = GroupMembership.objects.create(
            group=self.group, user=sam, joined_at=sam_joined_date
        )
        
        # Expense created on March 1 (before Sam joined)
        expense = Expense.objects.create(
            group=self.group,
            title='Rent March',
            amount=Decimal('3000.00'),
            currency='INR',
            payer=self.aisha,
            date=date(2026, 3, 1),
            split_type='EQUAL',
            converted_amount=Decimal('3000.00'),
            exchange_rate=Decimal('1.00'),
            created_by=self.aisha
        )
        
        # Active participants on March 1st: Aisha, Rohan, Priya. (Sam is excluded because date is before April 15)
        active_participants = [self.aisha, self.rohan, self.priya]
        calculate_and_create_participants(expense, active_participants, 'EQUAL', {})
        
        balances = calculate_group_balances(self.group)
        summaries = balances['user_summaries']
        
        # Sam should not owe anything for this expense
        self.assertEqual(summaries.get(sam.id, {'net': Decimal('0.00')})['net'], Decimal('0.00'))
        # Aisha paid 3000, owes 1000, net is +2000
        self.assertEqual(summaries[self.aisha.id]['net'], Decimal('2000.00'))

    def test_greedy_simplification(self):
        # Net balances: Aisha +200, Rohan -100, Priya -100
        net_balances = {
            self.aisha.id: Decimal('200.00'),
            self.rohan.id: Decimal('-100.00'),
            self.priya.id: Decimal('-100.00'),
        }
        user_map = {
            self.aisha.id: self.aisha,
            self.rohan.id: self.rohan,
            self.priya.id: self.priya,
        }
        
        txs = get_simplified_settlements(net_balances, user_map)
        
        # Should return two transactions:
        # Rohan pays Aisha 100
        # Priya pays Aisha 100
        self.assertEqual(len(txs), 2)
        
        # Check values
        from_users = [t['from_user'] for t in txs]
        to_users = [t['to_user'] for t in txs]
        amounts = [t['amount'] for t in txs]
        
        self.assertIn('Rohan', from_users)
        self.assertIn('Priya', from_users)
        self.assertEqual(to_users, ['Aisha', 'Aisha'])
        self.assertEqual(amounts, [Decimal('100.00'), Decimal('100.00')])

    def test_settlements_reduce_debts(self):
        # 1. Add dinner expense (Aisha pays 300, split 3 ways)
        expense = Expense.objects.create(
            group=self.group,
            title='Dinner',
            amount=Decimal('300.00'),
            currency='INR',
            payer=self.aisha,
            date=date(2026, 1, 10),
            split_type='EQUAL',
            converted_amount=Decimal('300.00'),
            exchange_rate=Decimal('1.00'),
            created_by=self.aisha
        )
        calculate_and_create_participants(expense, [self.aisha, self.rohan, self.priya], 'EQUAL', {})
        
        # 2. Rohan pays off his 100 INR debt to Aisha
        Settlement.objects.create(
            group=self.group,
            payer=self.rohan,
            receiver=self.aisha,
            amount=Decimal('100.00'),
            currency='INR',
            converted_amount=Decimal('100.00'),
            exchange_rate=Decimal('1.00'),
            date=date(2026, 1, 11),
            created_by=self.rohan
        )
        
        balances = calculate_group_balances(self.group)
        summaries = balances['user_summaries']
        
        # Rohan net balance should be 0.00 now (owed 100, settled 100)
        self.assertEqual(summaries[self.rohan.id]['net'], Decimal('0.00'))
        # Priya net balance is still -100
        self.assertEqual(summaries[self.priya.id]['net'], Decimal('-100.00'))
        # Aisha net balance is now +100
        self.assertEqual(summaries[self.aisha.id]['net'], Decimal('100.00'))

    def test_multi_currency_conversion(self):
        # Create exchange rate: 1 USD = 83.00 INR on 2026-02-01
        ExchangeRate.objects.create(
            base_currency='INR',
            target_currency='USD',
            rate=Decimal('83.00'),
            date=date(2026, 2, 1)
        )
        
        # Aisha pays 10 USD on 2026-02-01, split equally with Rohan
        rate = get_exchange_rate('INR', 'USD', date(2026, 2, 1))
        self.assertEqual(rate, Decimal('83.00'))
        
        converted = Decimal('10.00') * rate # 830.00 INR
        
        expense = Expense.objects.create(
            group=self.group,
            title='USD Coffee',
            amount=Decimal('10.00'),
            currency='USD',
            payer=self.aisha,
            date=date(2026, 2, 1),
            split_type='EQUAL',
            converted_amount=converted,
            exchange_rate=rate,
            created_by=self.aisha
        )
        
        calculate_and_create_participants(expense, [self.aisha, self.rohan], 'EQUAL', {})
        
        balances = calculate_group_balances(self.group)
        summaries = balances['user_summaries']
        
        # Aisha paid 10 USD (830 INR), owes 415 INR. Net = +415.00
        self.assertEqual(summaries[self.aisha.id]['net'], Decimal('415.00'))
        # Rohan owes 415 INR. Net = -415.00
        self.assertEqual(summaries[self.rohan.id]['net'], Decimal('-415.00'))


class CSVAnomalyDetectorTestCase(TestCase):
    def setUp(self):
        self.aisha = User.objects.create_user(username='Aisha', email='aisha@example.com', password='password123')
        self.rohan = User.objects.create_user(username='Rohan', email='rohan@example.com', password='password123')
        self.group = Group.objects.create(name='Flat', created_by=self.aisha)
        GroupMembership.objects.create(
            group=self.group, user=self.aisha, joined_at=timezone.make_aware(datetime(2026, 1, 1))
        )
        GroupMembership.objects.create(
            group=self.group, user=self.rohan, joined_at=timezone.make_aware(datetime(2026, 1, 1))
        )

    def test_detect_split_inconsistency(self):
        # Row with UNEQUAL split sum mismatching amount
        row = {
            'title': 'Dinner',
            'amount': '100.00',
            'currency': 'INR',
            'payer': 'Aisha',
            'participants': 'Aisha,Rohan',
            'date': '2026-01-10',
            'split_type': 'UNEQUAL',
            'split_details': 'Aisha:40,Rohan:50' # sum is 90 != 100
        }
        
        anomalies = detect_anomalies_for_row(row, 1, self.group, [])
        types = [a['type'] for a in anomalies]
        self.assertIn('INCONSISTENT_SPLIT', types)

    def test_detect_membership_violation(self):
        # Create user Meera who hasn't joined the group yet
        meera = User.objects.create_user(username='Meera', email='meera@example.com', password='password123')
        
        row = {
            'title': 'Rent',
            'amount': '500.00',
            'currency': 'INR',
            'payer': 'Aisha',
            'participants': 'Aisha,Meera', # Meera is not a group member on 2026-01-10
            'date': '2026-01-10',
            'split_type': 'EQUAL',
            'split_details': ''
        }
        
        anomalies = detect_anomalies_for_row(row, 1, self.group, [])
        types = [a['type'] for a in anomalies]
        self.assertIn('MEMBERSHIP_VIOLATION', types)

    def test_detect_invalid_amount_operation(self):
        # Row with non-numeric amount string
        row_non_numeric = {
            'title': 'Rent',
            'amount': 'abc',
            'currency': 'INR',
            'payer': 'Aisha',
            'participants': 'Aisha,Rohan',
            'date': '2026-01-10',
            'split_type': 'EQUAL',
            'split_details': ''
        }
        
        anomalies_nn = detect_anomalies_for_row(row_non_numeric, 1, self.group, [])
        types_nn = [a['type'] for a in anomalies_nn]
        self.assertIn('INVALID_AMOUNT', types_nn)

        # Row with empty amount string
        row_empty = {
            'title': 'Rent',
            'amount': '',
            'currency': 'INR',
            'payer': 'Aisha',
            'participants': 'Aisha,Rohan',
            'date': '2026-01-10',
            'split_type': 'EQUAL',
            'split_details': ''
        }
        
        anomalies_empty = detect_anomalies_for_row(row_empty, 2, self.group, [])
        types_empty = [a['type'] for a in anomalies_empty]
        self.assertIn('EMPTY_FIELD', types_empty)

    def test_parse_flexible_date_formats(self):
        # DD-MM-YYYY
        dt1 = parse_flexible_date("01-02-2026")
        self.assertEqual(dt1, date(2026, 2, 1))
        
        # Mar-14 (defaults to year 2026)
        dt2 = parse_flexible_date("Mar-14")
        self.assertEqual(dt2, date(2026, 3, 14))

        # YYYY-MM-DD
        dt3 = parse_flexible_date("2026-03-15")
        self.assertEqual(dt3, date(2026, 3, 15))

    def test_clean_row_data_normalization(self):
        row = {
            'date': '01-02-2026',
            'description': 'February rent',
            'paid_by': 'Aisha',
            'amount': '48,000',
            'currency': 'INR',
            'split_type': 'equal',
            'split_with': 'Aisha;Rohan;Priya;Meera',
            'split_details': '',
            'notes': 'rent details'
        }
        
        cleaned = clean_row_data(row)
        self.assertEqual(cleaned['title'], 'February rent')
        self.assertEqual(cleaned['description'], 'rent details')
        self.assertEqual(cleaned['payer'], 'Aisha')
        self.assertEqual(cleaned['participants'], 'Aisha,Rohan,Priya,Meera')

    def test_parse_split_details_formats(self):
        # Semicolon separated, space separated Rohan 700; Priya 400
        res1 = parse_split_details("Rohan 700; Priya 400")
        self.assertEqual(res1['Rohan'], Decimal('700'))
        self.assertEqual(res1['Priya'], Decimal('400'))
        
        # Semicolon separated percentage Aisha 30%; Rohan 30%
        res2 = parse_split_details("Aisha 30%; Rohan 30%")
        self.assertEqual(res2['Aisha'], Decimal('30'))
        self.assertEqual(res2['Rohan'], Decimal('30'))

    def test_auto_resolve_job_anomalies(self):
        # Create Priya user in system
        User.objects.create_user(username='Priya', email='priya@example.com', password='password123')
        
        # Create an import job
        job = ImportJob.objects.create(group=self.group, user=self.aisha, file_name='test.csv', status='PENDING_REVIEW')
        
        # Create a pending anomaly
        anomaly = ImportAnomaly.objects.create(
            import_job=job,
            row_number=1,
            raw_data={},
            anomaly_type='UNKNOWN_MEMBER',
            severity='WARNING',
            description="Participant username 'Priya S' does not exist in the database.",
            status='PENDING'
        )
        
        # Priya exists in system as user (created in setUp), so Priya S should map to Priya
        count = auto_resolve_job_anomalies(job.id)
        self.assertEqual(count, 1)
        
        # Refresh anomaly
        anomaly.refresh_from_db()
        self.assertEqual(anomaly.status, 'RESOLVED')
        self.assertEqual(anomaly.resolution_action, 'MAP_TO_USER:Priya')

    def test_intelligent_unknown_member_resolution_and_commit(self):
        # Rohan, Priya, Dev do not exist as users with these exact case/variants in the DB.
        # We upload a mock CSV with: rohan, Rohan, priya, Priya s, sam, Sam.
        # Let's create an import job with simulated CSV file content
        import tempfile
        import os
        
        csv_content = (
            "date,description,paid_by,amount,currency,split_type,split_with,split_details,notes\n"
            "2026-03-01,Dinner,rohan,300,INR,equal,rohan;Priya s;sam,,\n"
            "2026-03-02,Snacks,Rohan,150,INR,equal,Rohan;priya;Sam,,\n"
        )
        
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as tf:
            tf.write(csv_content)
            temp_path = tf.name
            
        try:
            job = ImportJob.objects.create(
                group=self.group,
                user=self.aisha,
                file_name=temp_path,
                status='PENDING_REVIEW'
            )
            
            # 1. Run detection
            process_csv_import(job.id)
            
            # Check raw anomalies
            anomalies = list(job.anomalies.all())
            unknown_anomalies = [a for a in anomalies if a.anomaly_type == 'UNKNOWN_MEMBER']
            # We expect unknown member anomalies for: rohan, Priya s, sam, Rohan, priya, Sam.
            self.assertTrue(len(unknown_anomalies) > 0)
            
            # 2. Run Auto-Resolve
            auto_resolve_job_anomalies(job.id)
            
            # Check resolved actions
            anomalies_resolved = list(job.anomalies.all())
            # For Rohan/rohan: since Rohan is in DB, both should map to MAP_TO_USER:Rohan
            rohan_actions = {a.resolution_action for a in anomalies_resolved if 'rohan' in a.description.lower()}
            self.assertEqual(rohan_actions, {'MAP_TO_USER:Rohan'})
            
            # For Priya/Priya s/priya: one should be CREATE_SHELL_USER (for Priya), others MAP_TO_USER:Priya
            priya_actions = {a.resolution_action for a in anomalies_resolved if 'priya' in a.description.lower()}
            self.assertIn('CREATE_SHELL_USER', priya_actions)
            self.assertIn('MAP_TO_USER:Priya', priya_actions)
            
            # For Sam/sam: one should be CREATE_SHELL_USER, other MAP_TO_USER:Sam
            sam_actions = {a.resolution_action for a in anomalies_resolved if 'sam' in a.description.lower()}
            self.assertIn('CREATE_SHELL_USER', sam_actions)
            self.assertIn('MAP_TO_USER:Sam', sam_actions)
            
            # 3. Commit the job
            commit_resolved_import(job.id, self.aisha)
            
            # Check that only one user record exists in the database for each name
            rohan_users = User.objects.filter(username__iexact='rohan')
            self.assertEqual(rohan_users.count(), 1)
            self.assertEqual(rohan_users.first().username, 'Rohan')
            
            priya_users = User.objects.filter(username__iexact='priya')
            self.assertEqual(priya_users.count(), 1)
            self.assertEqual(priya_users.first().username, 'Priya')
            
            sam_users = User.objects.filter(username__iexact='sam')
            self.assertEqual(sam_users.count(), 1)
            self.assertEqual(sam_users.first().username, 'Sam')
            
            # Check created expenses
            expenses = Expense.objects.filter(group=self.group)
            self.assertEqual(expenses.count(), 2)
            
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)


class ExpenseCrudAndAuthTestCase(TestCase):
    def setUp(self):
        self.creator = User.objects.create_user(username='creator', email='creator@example.com', password='password123')
        self.member = User.objects.create_user(username='member', email='member@example.com', password='password123')
        self.stranger = User.objects.create_user(username='stranger', email='stranger@example.com', password='password123')
        
        self.group = Group.objects.create(name='Test Group', created_by=self.creator)
        self.m_creator = GroupMembership.objects.create(group=self.group, user=self.creator, joined_at=timezone.now())
        self.m_member = GroupMembership.objects.create(group=self.group, user=self.member, joined_at=timezone.now())

    def test_group_deletion_permissions(self):
        from rest_framework.test import APIClient
        client = APIClient()
        
        # Stranger cannot delete - should return 404 since they are not in the group
        client.force_authenticate(user=self.stranger)
        res = client.delete(f'/api/groups/{self.group.id}/')
        self.assertEqual(res.status_code, 404)
        
        # Member cannot delete - should return 403 since they are in the group but not creator
        client.force_authenticate(user=self.member)
        res = client.delete(f'/api/groups/{self.group.id}/')
        self.assertEqual(res.status_code, 403)
        
        # Creator can delete
        client.force_authenticate(user=self.creator)
        res = client.delete(f'/api/groups/{self.group.id}/')
        self.assertEqual(res.status_code, 204)
        self.assertFalse(Group.objects.filter(id=self.group.id).exists())

    def test_membership_leave_and_remove_permissions(self):
        from rest_framework.test import APIClient
        client = APIClient()
        
        # Stranger cannot remove member - should return 404 since membership is not in stranger's group context
        client.force_authenticate(user=self.stranger)
        res = client.post(f'/api/memberships/{self.m_member.id}/leave/')
        self.assertEqual(res.status_code, 404)
        
        # Member cannot remove creator - should return 403
        client.force_authenticate(user=self.member)
        res = client.post(f'/api/memberships/{self.m_creator.id}/leave/')
        self.assertEqual(res.status_code, 403)
        
        # Member can leave themselves
        client.force_authenticate(user=self.member)
        res = client.post(f'/api/memberships/{self.m_member.id}/leave/')
        self.assertEqual(res.status_code, 200)
        self.m_member.refresh_from_db()
        self.assertIsNotNone(self.m_member.left_at)
        
        # Re-activate membership for next check
        self.m_member.left_at = None
        self.m_member.save()
        
        # Creator can remove member
        client.force_authenticate(user=self.creator)
        res = client.post(f'/api/memberships/{self.m_member.id}/leave/')
        self.assertEqual(res.status_code, 200)
        self.m_member.refresh_from_db()
        self.assertIsNotNone(self.m_member.left_at)

    def test_expense_edit_and_split_recalculation(self):
        # Create initial expense
        expense = Expense.objects.create(
            group=self.group,
            title='Rent',
            amount=Decimal('100.00'),
            currency='INR',
            payer=self.creator,
            date=date(2026, 1, 1),
            split_type='EQUAL',
            converted_amount=Decimal('100.00'),
            exchange_rate=Decimal('1.00'),
            created_by=self.creator
        )
        calculate_and_create_participants(expense, [self.creator, self.member], 'EQUAL', {})
        
        from rest_framework.test import APIClient
        client = APIClient()
        client.force_authenticate(user=self.creator)
        
        # Update expense (change amount to 300, split_type unequal, custom splits)
        update_data = {
            'title': 'Updated Rent',
            'amount': '300.00',
            'currency': 'INR',
            'payer': str(self.creator.id),
            'date': '2026-01-01',
            'split_type': 'UNEQUAL',
            'participant_ids': [str(self.creator.id), str(self.member.id)],
            'split_details': {
                str(self.creator.id): '100.00',
                str(self.member.id): '200.00'
            }
        }
        res = client.patch(f'/api/expenses/{expense.id}/', update_data, format='json')
        self.assertEqual(res.status_code, 200)
        
        expense.refresh_from_db()
        self.assertEqual(expense.title, 'Updated Rent')
        self.assertEqual(expense.amount, Decimal('300.00'))
        self.assertEqual(expense.split_type, 'UNEQUAL')
        
        participants = list(expense.participants.all())
        self.assertEqual(len(participants), 2)
        
        creator_part = next(p for p in participants if p.user == self.creator)
        member_part = next(p for p in participants if p.user == self.member)
        
        self.assertEqual(creator_part.amount, Decimal('100.00'))
        self.assertEqual(member_part.amount, Decimal('200.00'))

    def test_expense_edit_and_delete_permissions(self):
        # Create initial expense paid by self.creator
        expense = Expense.objects.create(
            group=self.group,
            title='Internet',
            amount=Decimal('50.00'),
            currency='INR',
            payer=self.creator,
            date=date(2026, 1, 1),
            split_type='EQUAL',
            converted_amount=Decimal('50.00'),
            exchange_rate=Decimal('1.00'),
            created_by=self.member  # created by member, but paid by creator
        )
        calculate_and_create_participants(expense, [self.creator, self.member], 'EQUAL', {})

        from rest_framework.test import APIClient
        client = APIClient()

        # Member (who created but did not pay) tries to edit it -> should get 403 Forbidden
        client.force_authenticate(user=self.member)
        update_data = {
            'title': 'Hacked Internet Title',
            'amount': '150.00'
        }
        res = client.patch(f'/api/expenses/{expense.id}/', update_data, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertIn('Only the user who paid the expense can edit it', res.data['error'])

        # Member tries to delete it -> should get 403 Forbidden
        res = client.delete(f'/api/expenses/{expense.id}/')
        self.assertEqual(res.status_code, 403)
        self.assertIn('Only the user who paid the expense can delete it', res.data['error'])

        # Creator (who paid the expense) can edit it
        client.force_authenticate(user=self.creator)
        res = client.patch(f'/api/expenses/{expense.id}/', {'title': 'Updated by Creator'}, format='json')
        self.assertEqual(res.status_code, 200)

        # Creator can delete it
        res = client.delete(f'/api/expenses/{expense.id}/')
        self.assertEqual(res.status_code, 204)
        self.assertFalse(Expense.objects.filter(id=expense.id).exists())

    def test_left_member_cannot_access_group(self):
        from rest_framework.test import APIClient
        client = APIClient()

        # Initially, member is in the group and can view it
        client.force_authenticate(user=self.member)
        res = client.get(f'/api/groups/{self.group.id}/')
        self.assertEqual(res.status_code, 200)

        # Member leaves the group
        self.m_member.left_at = timezone.now()
        self.m_member.save()

        # Member tries to view the group -> should get 404 since they are no longer an active member
        res = client.get(f'/api/groups/{self.group.id}/')
        self.assertEqual(res.status_code, 404)

        # Member tries to add an expense to this group -> should get 404 (Group not found for active membership)
        expense_data = {
            'group': str(self.group.id),
            'title': 'Left member expense',
            'amount': '100.00',
            'payer': str(self.member.id),
            'date': '2026-01-01',
            'participant_ids': [str(self.member.id)]
        }
        res = client.post('/api/expenses/', expense_data, format='json')
        self.assertEqual(res.status_code, 404)

class UserOtpTestCase(TestCase):
    def test_otp_signup_flow(self):
        from rest_framework.test import APIClient
        from expenses.models import User
        from django.utils import timezone
        from datetime import timedelta
        client = APIClient()

        # 1. Register a new user
        reg_data = {
            'username': 'otpuser',
            'email': 'otpuser@example.com',
            'password': 'Password123!'
        }
        res = client.post('/api/register/', reg_data, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['username'], 'otpuser')
        self.assertIn('message', res.data)

        # Check database state
        user = User.objects.get(username='otpuser')
        self.assertFalse(user.is_verified)
        self.assertFalse(user.is_active)
        self.assertIsNotNone(user.otp_code)
        self.assertEqual(len(user.otp_code), 6)
        self.assertIsNotNone(user.otp_created_at)

        # 2. Try to verify with incorrect OTP
        verify_data = {
            'username': 'otpuser',
            'otp': '000000'
        }
        res = client.post('/api/register/verify-otp/', verify_data, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['detail'], 'Invalid OTP.')

        # 3. Try to verify with expired OTP
        user.otp_created_at = timezone.now() - timedelta(minutes=11)
        user.save()
        verify_data['otp'] = user.otp_code
        res = client.post('/api/register/verify-otp/', verify_data, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['detail'], 'OTP has expired. Please request a new one.')

        # 4. Resend OTP
        res = client.post('/api/register/resend-otp/', {'username': 'otpuser'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['detail'], 'OTP resent successfully.')

        # Verify new OTP is generated and timestamp is updated
        user.refresh_from_db()
        self.assertIsNotNone(user.otp_code)
        self.assertTrue(timezone.now() - user.otp_created_at < timedelta(seconds=10))

        # 5. Verify with correct OTP
        verify_data['otp'] = user.otp_code
        res = client.post('/api/register/verify-otp/', verify_data, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertIn('user', res.data)
        self.assertIn('token', res.data)
        self.assertIn('access', res.data['token'])

        user.refresh_from_db()
        self.assertTrue(user.is_verified)
        self.assertTrue(user.is_active)
        self.assertIsNone(user.otp_code)

    def test_claim_placeholder_shell_account(self):
        from rest_framework.test import APIClient
        from expenses.models import User
        client = APIClient()

        # Create an inactive placeholder shell user as if created by import
        shell_user = User.objects.create(
            username='aisha',
            email='aisha@example.com',
            is_active=False
        )
        shell_user.set_unusable_password()
        shell_user.save()

        # Try to register using the same username 'aisha' -> should succeed
        reg_data = {
            'username': 'aisha',
            'email': 'aisha_real@example.com',
            'password': 'NewPassword123!'
        }
        res = client.post('/api/register/', reg_data, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['username'], 'aisha')

        # Check database: user is still inactive/unverified but has new password and email set
        shell_user.refresh_from_db()
        self.assertFalse(shell_user.is_active)
        self.assertFalse(shell_user.is_verified)
        self.assertEqual(shell_user.email, 'aisha_real@example.com')
        self.assertTrue(shell_user.has_usable_password())

        # Verify correct OTP to activate the user
        verify_data = {
            'username': 'aisha',
            'otp': shell_user.otp_code
        }
        res = client.post('/api/register/verify-otp/', verify_data, format='json')
        self.assertEqual(res.status_code, 200)

        # User is now active
        shell_user.refresh_from_db()
        self.assertTrue(shell_user.is_active)
        self.assertTrue(shell_user.is_verified)


