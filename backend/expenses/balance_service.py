from decimal import Decimal
from django.db.models import Q
from expenses.models import User, Group, GroupMembership, Expense, ExpenseParticipant, Settlement

def calculate_group_balances(group):
    """
    Calculates direct pairwise debts and net balances for all members of a group.
    Returns:
        {
            'net_balances': {user_id: Decimal},
            'direct_debts': {debtor_id: {creditor_id: Decimal}},
            'user_summaries': {user_id: {'owed': Decimal, 'receivable': Decimal, 'net': Decimal}}
        }
    """
    memberships = group.memberships.all()
    member_ids = [m.user_id for m in memberships]
    
    # Initialize structures
    net_balances = {m_id: Decimal('0.00') for m_id in member_ids}
    
    # direct_debts[A][B] = X means A owes B amount X
    direct_debts = {m_id: {other_id: Decimal('0.00') for other_id in member_ids if other_id != m_id} for m_id in member_ids}
    
    # Fetch all group expenses and settlements
    expenses = group.expenses.prefetch_related('participants').all()
    settlements = group.settlements.all()
    
    # 1. Process expenses
    for exp in expenses:
        payer_id = exp.payer_id
        if payer_id not in net_balances:
            continue  # Payer is no longer/not a group member
            
        participants = exp.participants.all()
        for p in participants:
            p_id = p.user_id
            if p_id not in net_balances:
                continue # Participant not in group
                
            amount_owed = p.amount # already in base currency (INR)
            
            # Net balance adjustments
            net_balances[p_id] -= amount_owed
            net_balances[payer_id] += amount_owed
            
            # Direct debt tracking (if participant is not the payer)
            if p_id != payer_id:
                direct_debts[p_id][payer_id] += amount_owed

    # 2. Process settlements
    for sett in settlements:
        payer_id = sett.payer_id
        receiver_id = sett.receiver_id
        amount = sett.converted_amount # already in base currency (INR)
        
        # Adjust net balances
        if payer_id in net_balances:
            net_balances[payer_id] += amount
        if receiver_id in net_balances:
            net_balances[receiver_id] -= amount
            
        # Adjust direct debts
        if payer_id in direct_debts and receiver_id in direct_debts[payer_id]:
            direct_debts[payer_id][receiver_id] -= amount

    # 3. Simplify direct debts (Net them out pairwise)
    # If A owes B 100 and B owes A 60, then A owes B 40.
    final_direct_debts = {m_id: {} for m_id in member_ids}
    
    for u_id in member_ids:
        for other_id in direct_debts[u_id]:
            if u_id < other_id: # process each pair once
                owe_val = direct_debts[u_id][other_id]
                recip_val = direct_debts[other_id][u_id]
                
                net_owe = owe_val - recip_val
                if net_owe > Decimal('0.00'):
                    final_direct_debts[u_id][other_id] = net_owe.quantize(Decimal('0.01'))
                elif net_owe < Decimal('0.00'):
                    final_direct_debts[other_id][u_id] = (-net_owe).quantize(Decimal('0.01'))

    # 4. Generate user summaries (owed, receivable, net)
    user_summaries = {}
    for u_id in member_ids:
        owed = Decimal('0.00')
        receivable = Decimal('0.00')
        
        # Sum what this user owes others
        for other_id, amount in final_direct_debts[u_id].items():
            owed += amount
            
        # Sum what others owe this user
        for other_id in member_ids:
            if u_id in final_direct_debts[other_id]:
                receivable += final_direct_debts[other_id][u_id]
                
        user_summaries[u_id] = {
            'owed': owed,
            'receivable': receivable,
            'net': net_balances[u_id].quantize(Decimal('0.01'))
        }
        
    return {
        'net_balances': net_balances,
        'direct_debts': final_direct_debts,
        'user_summaries': user_summaries
    }

def get_simplified_settlements(net_balances, user_map):
    """
    Computes a simplified set of transactions to resolve all debts (Greedy algorithm).
    net_balances: Dict of {user_id: Decimal}
    user_map: Dict of {user_id: User_instance}
    Returns:
        List of dicts: [{'from_user': username, 'to_user': username, 'amount': Decimal}]
    """
    # Filter out users with zero balance
    debtors = []
    creditors = []
    
    for u_id, bal in net_balances.items():
        if u_id not in user_map:
            continue
        user = user_map[u_id]
        
        val = bal.quantize(Decimal('0.01'))
        if val < Decimal('-0.02'):
            debtors.append({'user': user, 'amount': -val})
        elif val > Decimal('0.02'):
            creditors.append({'user': user, 'amount': val})
            
    # Sort descending
    debtors.sort(key=lambda x: x['amount'], reverse=True)
    creditors.sort(key=lambda x: x['amount'], reverse=True)
    
    simplified_txs = []
    
    while debtors and creditors:
        debtor = debtors[0]
        creditor = creditors[0]
        
        settle_amt = min(debtor['amount'], creditor['amount'])
        
        simplified_txs.append({
            'from_user': debtor['user'].username,
            'from_user_id': str(debtor['user'].id),
            'to_user': creditor['user'].username,
            'to_user_id': str(creditor['user'].id),
            'amount': settle_amt
        })
        
        debtor['amount'] -= settle_amt
        creditor['amount'] -= settle_amt
        
        # Remove or re-sort
        if debtor['amount'] < Decimal('0.02'):
            debtors.pop(0)
        else:
            debtors.sort(key=lambda x: x['amount'], reverse=True)
            
        if creditor['amount'] < Decimal('0.02'):
            creditors.pop(0)
        else:
            creditors.sort(key=lambda x: x['amount'], reverse=True)
            
    return simplified_txs

def get_ledger_explanation(group, user_a, user_b):
    """
    Generates a list of all transactions contributing to the balance between A and B.
    Specifically:
    - Expenses paid by A where B is a participant.
    - Expenses paid by B where A is a participant.
    - Settlements paid by A to B.
    - Settlements paid by B to A.
    """
    ledger = []
    
    # 1. Expenses paid by A where B is a participant
    exp_a_paid = Expense.objects.filter(
        group=group,
        payer=user_a,
        participants__user=user_b
    ).prefetch_related('participants').distinct()
    
    for exp in exp_a_paid:
        part_row = exp.participants.get(user=user_b)
        ledger.append({
            'type': 'expense',
            'id': str(exp.id),
            'title': exp.title,
            'date': exp.date.isoformat(),
            'payer': user_a.username,
            'original_amount': float(exp.amount),
            'currency': exp.currency,
            'converted_total': float(exp.converted_amount),
            'user_share_original': float(part_row.original_amount) if part_row.original_amount else None,
            'user_share_converted': float(part_row.amount), # INR
            'effect': 'receivable', # User A is owed money by B
            'description': f"{user_b.username} owes {user_a.username} for share of '{exp.title}'"
        })

    # 2. Expenses paid by B where A is a participant
    exp_b_paid = Expense.objects.filter(
        group=group,
        payer=user_b,
        participants__user=user_a
    ).prefetch_related('participants').distinct()
    
    for exp in exp_b_paid:
        part_row = exp.participants.get(user=user_a)
        ledger.append({
            'type': 'expense',
            'id': str(exp.id),
            'title': exp.title,
            'date': exp.date.isoformat(),
            'payer': user_b.username,
            'original_amount': float(exp.amount),
            'currency': exp.currency,
            'converted_total': float(exp.converted_amount),
            'user_share_original': float(part_row.original_amount) if part_row.original_amount else None,
            'user_share_converted': float(part_row.amount), # INR
            'effect': 'owed', # User A owes money to B
            'description': f"{user_a.username} owes {user_b.username} for share of '{exp.title}'"
        })

    # 3. Settlements paid by A to B
    sett_a_to_b = Settlement.objects.filter(
        group=group,
        payer=user_a,
        receiver=user_b
    )
    for sett in sett_a_to_b:
        ledger.append({
            'type': 'settlement',
            'id': str(sett.id),
            'title': sett.note or 'Debt Settlement',
            'date': sett.date.isoformat(),
            'payer': user_a.username,
            'original_amount': float(sett.amount),
            'currency': sett.currency,
            'converted_total': float(sett.converted_amount),
            'user_share_original': float(sett.amount),
            'user_share_converted': float(sett.converted_amount),
            'effect': 'payment_sent', # A paid B, reducing A's debt
            'description': f"{user_a.username} settled {sett.amount} {sett.currency} to {user_b.username}"
        })

    # 4. Settlements paid by B to A
    sett_b_to_a = Settlement.objects.filter(
        group=group,
        payer=user_b,
        receiver=user_a
    )
    for sett in sett_b_to_a:
        ledger.append({
            'type': 'settlement',
            'id': str(sett.id),
            'title': sett.note or 'Debt Settlement',
            'date': sett.date.isoformat(),
            'payer': user_b.username,
            'original_amount': float(sett.amount),
            'currency': sett.currency,
            'converted_total': float(sett.converted_amount),
            'user_share_original': float(sett.amount),
            'user_share_converted': float(sett.converted_amount),
            'effect': 'payment_received', # B paid A, reducing B's debt (or increasing A's credit)
            'description': f"{user_b.username} settled {sett.amount} {sett.currency} to {user_a.username}"
        })

    # Sort ledger by date
    ledger.sort(key=lambda x: x['date'])
    
    # Calculate running net balance
    # Net balance represents what B owes A (so positive = B owes A, negative = A owes B)
    net_val = Decimal('0.00')
    for item in ledger:
        effect = item['effect']
        val = Decimal(str(item['user_share_converted']))
        if effect == 'receivable': # B owes A
            net_val += val
        elif effect == 'owed': # A owes B
            net_val -= val
        elif effect == 'payment_sent': # A paid B, so A owes B less
            net_val += val
        elif effect == 'payment_received': # B paid A, so B owes A less
            net_val -= val
        item['running_balance_converted'] = float(net_val)
        
    return ledger
