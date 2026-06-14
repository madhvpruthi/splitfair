import csv
import logging
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from django.utils import timezone
from django.db import transaction
from expenses.models import (
    User, Group, GroupMembership, Expense, ExpenseParticipant,
    Settlement, ExchangeRate, ImportJob, ImportAnomaly, ImportReport, AuditLog
)

logger = logging.getLogger(__name__)

# Default Exchange Rates Fallbacks
DEFAULT_RATES = {
    ('INR', 'USD'): Decimal('0.012'),
    ('USD', 'INR'): Decimal('83.00'),
}

def get_exchange_rate(base_currency, target_currency, rate_date):
    """
    Retrieves the exchange rate. Converted = Original * Rate
    For USD original and INR base: Base(INR) = Original(USD) * Rate(e.g. 83)
    """
    if base_currency == target_currency:
        return Decimal('1.000000')
    
    # Try fetching from DB
    rate_obj = ExchangeRate.objects.filter(
        base_currency=base_currency,
        target_currency=target_currency,
        date=rate_date
    ).first()
    
    if rate_obj:
        return rate_obj.rate
    
    # Check if reciprocal exists
    reciprocal = ExchangeRate.objects.filter(
        base_currency=target_currency,
        target_currency=base_currency,
        date=rate_date
    ).first()
    
    if reciprocal and reciprocal.rate > 0:
        return Decimal('1.000000') / reciprocal.rate
    
    # Fallback to default rate constants
    rate = DEFAULT_RATES.get((base_currency, target_currency))
    if rate:
        # Save rate to database for future speedups
        ExchangeRate.objects.get_or_create(
            base_currency=base_currency,
            target_currency=target_currency,
            date=rate_date,
            defaults={'rate': rate}
        )
        return rate
    
    # Default reciprocal check
    rate_recip = DEFAULT_RATES.get((target_currency, base_currency))
    if rate_recip:
        rate = Decimal('1.000000') / rate_recip
        ExchangeRate.objects.get_or_create(
            base_currency=base_currency,
            target_currency=target_currency,
            date=rate_date,
            defaults={'rate': rate}
        )
        return rate
        
    return Decimal('1.000000')

def parse_flexible_date(date_str):
    """
    Tries to parse date_str with multiple formats.
    Returns date object, or raises ValueError.
    """
    formats = [
        '%d-%m-%Y',
        '%d/%m/%Y',
        '%Y-%m-%d',
        '%Y/%m/%d',
        '%b-%d',
        '%b/%d',
        '%d-%b',
        '%d/%b',
        '%B-%d',
        '%B %d',
        '%d %B',
        '%b %d, %Y',
        '%B %d, %Y',
    ]
    date_str_clean = date_str.strip()
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str_clean, fmt)
            # If the format doesn't have a year (defaulted to 1900), set it to 2026
            if dt.year == 1900:
                dt = dt.replace(year=2026)
            return dt.date()
        except ValueError:
            continue
    raise ValueError(f"Unable to parse date: {date_str}")

def clean_row_data(row):
    """Clean whitespaces, normalize keys to standard fields, and handle None values."""
    raw_cleaned = {}
    for k, v in row.items():
        if k is not None:
            key = k.strip().lower()
            val = '' if v is None else (v.strip() if isinstance(v, str) else v)
            raw_cleaned[key] = val

    cleaned = {}
    # 1. Payer normalization
    if 'payer' in raw_cleaned:
        cleaned['payer'] = raw_cleaned['payer']
    elif 'paid_by' in raw_cleaned:
        cleaned['payer'] = raw_cleaned['paid_by']
    elif 'paid by' in raw_cleaned:
        cleaned['payer'] = raw_cleaned['paid by']
    else:
        cleaned['payer'] = ''

    # 2. Participants normalization
    if 'participants' in raw_cleaned:
        cleaned['participants'] = raw_cleaned['participants']
    elif 'split_with' in raw_cleaned:
        cleaned['participants'] = raw_cleaned['split_with'].replace(';', ',')
    elif 'split with' in raw_cleaned:
        cleaned['participants'] = raw_cleaned['split with'].replace(';', ',')
    else:
        cleaned['participants'] = ''

    # 3. Title / Description / Notes normalization
    if 'title' in raw_cleaned:
        cleaned['title'] = raw_cleaned['title']
        cleaned['description'] = raw_cleaned.get('description', '') or raw_cleaned.get('notes', '')
    else:
        cleaned['title'] = raw_cleaned.get('description', '')
        cleaned['description'] = raw_cleaned.get('notes', '')

    # 4. Copy standard fields
    for field in ['amount', 'currency', 'date', 'split_type', 'split_details']:
        cleaned[field] = raw_cleaned.get(field, '')

    return cleaned

def parse_split_details(details_str):
    """
    Parses details like:
    - "user1:100,user2:200"
    - "Rohan 700; Priya 400; Meera 400"
    - "Aisha 30%; Rohan 30%; Priya 30%; Meera 20%"
    - "Aisha 1; Rohan 2; Priya 1; Dev 2"
    Returns a dict {username: Decimal}
    """
    if not details_str or not isinstance(details_str, str):
        return {}
    
    # Standardize separators: replace semicolons with commas
    normalized = details_str.replace(';', ',')
    
    details = {}
    parts = normalized.split(',')
    for part in parts:
        part = part.strip()
        if not part:
            continue
            
        # Try finding separator: either colon or space
        if ':' in part:
            name_part, val_part = part.split(':', 1)
        else:
            # Split by last space
            part_parts = part.rsplit(None, 1)
            if len(part_parts) == 2:
                name_part, val_part = part_parts
            else:
                continue
                
        username = name_part.strip()
        val_clean = val_part.strip().replace('%', '').replace('$', '').replace('₹', '')
        try:
            val = Decimal(val_clean)
            details[username] = val
        except (ValueError, TypeError, InvalidOperation):
            details[username] = Decimal('0.00')
            
    return details

def detect_anomalies_for_row(row, row_number, group, existing_rows_in_job):
    """
    Analyzes a single row and returns a list of dictionaries representing detected anomalies.
    """
    anomalies = []
    
    title = row.get('title', '').strip()
    # Strip out commas from amount (e.g. "1,200" becomes "1200")
    amount_str = row.get('amount', '').strip().replace(',', '')
    currency = row.get('currency', '').strip().upper()
    payer_username = row.get('payer', '').strip()
    participants_str = row.get('participants', '').strip()
    date_str = row.get('date', '').strip()
    split_type = row.get('split_type', '').strip().upper()
    split_details_str = row.get('split_details', '').strip()
    
    # 1. Missing fields
    if not title:
        anomalies.append({
            'type': 'EMPTY_FIELD',
            'severity': 'ERROR',
            'description': 'Title is missing.'
        })
    
    # 2. Invalid Amount
    amount = None
    if not amount_str:
        anomalies.append({
            'type': 'EMPTY_FIELD',
            'severity': 'ERROR',
            'description': 'Amount is missing.'
        })
    else:
        try:
            amount = Decimal(amount_str)
            if amount <= 0:
                anomalies.append({
                    'type': 'INVALID_AMOUNT',
                    'severity': 'ERROR',
                    'description': f"Amount must be positive. Found: {amount_str}"
                })
        except (ValueError, TypeError, InvalidOperation):
            anomalies.append({
                'type': 'INVALID_AMOUNT',
                'severity': 'ERROR',
                'description': f"Amount is not a valid number. Found: {amount_str}"
            })
            
    # 3. Invalid Date
    exp_date = None
    if not date_str:
        anomalies.append({
            'type': 'EMPTY_FIELD',
            'severity': 'ERROR',
            'description': 'Date is missing.'
        })
    else:
        try:
            # Use flexible date parser supporting DD-MM-YYYY, Mar-14, YYYY-MM-DD
            exp_date = parse_flexible_date(date_str)
            if exp_date > date.today():
                anomalies.append({
                    'type': 'FUTURE_DATE',
                    'severity': 'WARNING',
                    'description': f"Date {date_str} is in the future."
                })
        except ValueError:
            anomalies.append({
                'type': 'INVALID_DATE',
                'severity': 'ERROR',
                'description': f"Date format is invalid. Expected YYYY-MM-DD or DD-MM-YYYY, found: {date_str}"
            })

    # 4. Invalid Currency
    if not currency:
        anomalies.append({
            'type': 'EMPTY_FIELD',
            'severity': 'WARNING',
            'description': 'Currency is missing. System will default to INR.'
        })
    elif currency not in ['INR', 'USD']:
        anomalies.append({
            'type': 'INVALID_CURRENCY',
            'severity': 'WARNING',
            'description': f"Unsupported currency '{currency}'. Only INR and USD are natively supported."
        })

    # 5. Missing Payer / Unknown User
    payer_user = None
    if not payer_username:
        anomalies.append({
            'type': 'EMPTY_FIELD',
            'severity': 'ERROR',
            'description': 'Payer is missing.'
        })
    else:
        payer_user = User.objects.filter(username=payer_username).first()
        if not payer_user:
            anomalies.append({
                'type': 'UNKNOWN_MEMBER',
                'severity': 'WARNING',
                'description': f"Payer username '{payer_username}' does not exist in the database."
            })

    # 6. Missing Participants / Unknown Participants
    participant_usernames = [p.strip() for p in participants_str.split(',') if p.strip()]
    if not participant_usernames:
        anomalies.append({
            'type': 'MISSING_PARTICIPANTS',
            'severity': 'ERROR',
            'description': 'No participants specified.'
        })
    else:
        for p_name in participant_usernames:
            if not User.objects.filter(username=p_name).exists():
                anomalies.append({
                    'type': 'UNKNOWN_MEMBER',
                    'severity': 'WARNING',
                    'description': f"Participant username '{p_name}' does not exist in the database."
                })

    # 7. Settlement recorded as expense
    desc_lower = title.lower() + " " + row.get('description', '').lower()
    is_settlement_hint = any(w in desc_lower for w in ['settle', 'payment', 'paid back', 'refund'])
    if is_settlement_hint and len(participant_usernames) == 1:
        anomalies.append({
            'type': 'SETTLEMENT_AS_EXPENSE',
            'severity': 'WARNING',
            'description': f"Expense title/description suggests this is a settlement between {payer_username} and {participant_usernames[0]}."
        })

    # 8. Membership Violations (If users exist and date is parsed)
    if exp_date:
        # Check Payer Membership
        if payer_user:
            membership = GroupMembership.objects.filter(group=group, user=payer_user).first()
            if not membership:
                anomalies.append({
                    'type': 'MEMBERSHIP_VIOLATION',
                    'severity': 'WARNING',
                    'description': f"Payer '{payer_username}' is not a member of group '{group.name}'."
                })
            else:
                # timezone dates are datetime, converting to date for comparison
                join_date = membership.joined_at.date()
                left_date_val = membership.left_at.date() if membership.left_at else None
                if exp_date < join_date or (left_date_val and exp_date > left_date_val):
                    anomalies.append({
                        'type': 'MEMBERSHIP_VIOLATION',
                        'severity': 'WARNING',
                        'description': f"Payer '{payer_username}' was not active in the group on {date_str} (joined={join_date}, left={left_date_val})."
                    })
        # Check Participants Memberships
        for p_name in participant_usernames:
            p_user = User.objects.filter(username=p_name).first()
            if p_user:
                membership = GroupMembership.objects.filter(group=group, user=p_user).first()
                if not membership:
                    anomalies.append({
                        'type': 'MEMBERSHIP_VIOLATION',
                        'severity': 'WARNING',
                        'description': f"Participant '{p_name}' is not a member of group '{group.name}'."
                    })
                else:
                    join_date = membership.joined_at.date()
                    left_date_val = membership.left_at.date() if membership.left_at else None
                    if exp_date < join_date or (left_date_val and exp_date > left_date_val):
                        anomalies.append({
                            'type': 'MEMBERSHIP_VIOLATION',
                            'severity': 'WARNING',
                            'description': f"Participant '{p_name}' was not active in the group on {date_str} (joined={join_date}, left={left_date_val})."
                        })

    # 9. Split validation (If split type and amount are valid)
    if amount and split_type:
        details = parse_split_details(split_details_str)
        if split_type == 'UNEQUAL':
            split_sum = sum(details.values())
            if abs(split_sum - amount) > Decimal('0.05'):
                anomalies.append({
                    'type': 'INCONSISTENT_SPLIT',
                    'severity': 'ERROR',
                    'description': f"Unequal split amounts sum to {split_sum}, which does not match expense amount {amount}."
                })
        elif split_type == 'PERCENTAGE':
            split_sum = sum(details.values())
            if abs(split_sum - Decimal('100.00')) > Decimal('0.05'):
                anomalies.append({
                    'type': 'INCONSISTENT_SPLIT',
                    'severity': 'ERROR',
                    'description': f"Percentage split values sum to {split_sum}%, which does not equal 100%."
                })
        elif split_type not in ['EQUAL', 'UNEQUAL', 'PERCENTAGE', 'SHARE']:
            anomalies.append({
                'type': 'INCONSISTENT_SPLIT',
                'severity': 'ERROR',
                'description': f"Unsupported split type '{split_type}'."
            })

    # 10. Duplicate Check
    # Check within current CSV job
    for prev_row in existing_rows_in_job:
        if (prev_row.get('title') == title and
            prev_row.get('payer') == payer_username and
            prev_row.get('amount') == amount_str and
            prev_row.get('date') == date_str):
            anomalies.append({
                'type': 'DUPLICATE',
                'severity': 'WARNING',
                'description': f"Row duplicate found in the uploaded file itself (Row matches title, payer, amount, and date)."
            })
            break

    # Check against database records
    if exp_date and amount and payer_user:
        db_dup = Expense.objects.filter(
            group=group,
            title=title,
            payer=payer_user,
            amount=amount,
            date=exp_date
        ).exists()
        if db_dup:
            anomalies.append({
                'type': 'DUPLICATE',
                'severity': 'WARNING',
                'description': f"Identical expense already exists in database (Title: {title}, Payer: {payer_username}, Amount: {amount}, Date: {date_str})."
            })

    return anomalies

def process_csv_import(import_job_id):
    """
    Reads the uploaded CSV from ImportJob, parses rows, runs checks,
    and populates ImportAnomaly records.
    """
    import_job = ImportJob.objects.get(id=import_job_id)
    group = import_job.group
    
    file_path = import_job.file_name  # The path to the saved CSV file
    
    existing_rows = []
    total_rows = 0
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row_idx, raw_row in enumerate(reader, start=1):
                total_rows += 1
                row = clean_row_data(raw_row)
                
                anomalies = detect_anomalies_for_row(row, row_idx, group, existing_rows)
                
                # Save anomalies to DB
                for anomaly in anomalies:
                    ImportAnomaly.objects.create(
                        import_job=import_job,
                        row_number=row_idx,
                        raw_data=raw_row,
                        anomaly_type=anomaly['type'],
                        severity=anomaly['severity'],
                        description=anomaly['description'],
                        status='PENDING'
                    )
                
                existing_rows.append(row)
                
        import_job.total_rows = total_rows
        # If no anomalies were created, the job is ready or can be auto-committed
        import_job.save()
        
    except Exception as e:
        logger.exception("Failed to parse CSV file")
        import_job.status = 'FAILED'
        import_job.save()
        raise e

@transaction.atomic
def commit_resolved_import(import_job_id, executing_user):
    """
    Iterates through the rows of the CSV, applies user resolutions,
    creates the actual Expense/Settlement database records, and generates report.
    """
    import_job = ImportJob.objects.select_for_update().get(id=import_job_id)
    if import_job.status != 'PENDING_REVIEW':
        raise ValueError("This import job has already been processed or failed.")
        
    # Check if there are any PENDING anomalies
    pending_anomalies = import_job.anomalies.filter(status='PENDING')
    if pending_anomalies.exists():
        raise ValueError(f"Cannot commit. There are {pending_anomalies.count()} unresolved anomalies.")
        
    group = import_job.group
    file_path = import_job.file_name
    
    successful_imports = 0
    failed_imports = 0
    reports = []
    
    # Pre-fetch resolutions group by row_number
    resolutions_by_row = {}
    for anomaly in import_job.anomalies.all():
        if anomaly.row_number not in resolutions_by_row:
            resolutions_by_row[anomaly.row_number] = []
        resolutions_by_row[anomaly.row_number].append(anomaly)
        
    # Build global user mappings to resolve usernames consistently across all rows
    global_user_mappings = {u.username.lower(): u for u in User.objects.all()}
    
    # Extract and apply all UNKNOWN_MEMBER resolutions first to create shell users up-front
    unknown_member_anomalies = import_job.anomalies.filter(anomaly_type='UNKNOWN_MEMBER')
    
    create_resolutions = [a for a in unknown_member_anomalies if a.resolution_action == 'CREATE_SHELL_USER']
    map_resolutions = [a for a in unknown_member_anomalies if a.resolution_action.startswith('MAP_TO_USER:')]
    
    import re
    def extract_name_from_description(desc):
        match = re.search(r"username '([^']+)'", desc)
        return match.group(1).strip() if match else None

    # Process CREATE_SHELL_USER resolutions
    for anomaly in create_resolutions:
        raw_name = extract_name_from_description(anomaly.description)
        if not raw_name:
            continue
            
        canonical_name = raw_name.strip()
        if canonical_name:
            canonical_name = canonical_name[0].upper() + canonical_name[1:]
            
        if canonical_name.lower() not in global_user_mappings:
            user = User.objects.create(
                username=canonical_name,
                email=f"{canonical_name.lower().replace(' ', '_')}@example.com",
                is_active=False
            )
            user.set_unusable_password()
            user.save()
            global_user_mappings[canonical_name.lower()] = user
            
        global_user_mappings[raw_name.lower()] = global_user_mappings[canonical_name.lower()]
        
    # Process MAP_TO_USER resolutions
    for anomaly in map_resolutions:
        raw_name = extract_name_from_description(anomaly.description)
        if not raw_name:
            continue
            
        mapped_uname = anomaly.resolution_action.split('MAP_TO_USER:')[1].strip()
        
        if mapped_uname.lower() in global_user_mappings:
            global_user_mappings[raw_name.lower()] = global_user_mappings[mapped_uname.lower()]
        else:
            try:
                user = User.objects.get(username=mapped_uname)
            except User.DoesNotExist:
                user = User.objects.create(
                    username=mapped_uname,
                    email=f"{mapped_uname.lower().replace(' ', '_')}@example.com",
                    is_active=False
                )
                user.set_unusable_password()
                user.save()
            global_user_mappings[mapped_uname.lower()] = user
            global_user_mappings[raw_name.lower()] = user

    with open(file_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row_idx, raw_row in enumerate(reader, start=1):
            row = clean_row_data(raw_row)
            row_resolutions = resolutions_by_row.get(row_idx, [])
            
            # Check if this row is completely ignored (skipped)
            skip_row = False
            for res in row_resolutions:
                if res.resolution_action == 'IGNORED':
                    skip_row = True
                    reports.append({
                        'row': row_idx,
                        'title': row.get('title'),
                        'status': 'SKIPPED',
                        'reason': f"Ignored by user resolution: {res.resolution_action}"
                    })
                    break
            
            if skip_row:
                continue
                
            try:
                # Resolve Users
                payer_name = row.get('payer', '').strip()
                participants_str = row.get('participants', '').strip()
                participant_names = [p.strip() for p in participants_str.split(',') if p.strip()]
                
                # Check user mappings from resolutions
                payer_user = resolve_user_for_import(payer_name, group, global_user_mappings, executing_user)
                
                participants = []
                for p_name in participant_names:
                    p_user = resolve_user_for_import(p_name, group, global_user_mappings, executing_user)
                    participants.append(p_user)
                
                # Extract basic fields
                title = row.get('title', '').strip()
                description = row.get('description', '').strip()
                amount_str = row.get('amount', '0').strip().replace(',', '')
                amount = Decimal(amount_str).quantize(Decimal('0.01'))
                currency = (row.get('currency') or 'INR').strip().upper()
                date_str = row.get('date').strip()
                exp_date = parse_flexible_date(date_str)
                split_type = row.get('split_type', 'EQUAL').strip().upper()
                split_details = parse_split_details(row.get('split_details', ''))
                
                # Adjust membership timelines if membership resolution says so
                for user in [payer_user] + participants:
                    ensure_membership_active(user, group, exp_date, row_resolutions)

                # Check if it should be imported as a Settlement instead of Expense
                is_settlement = False
                for res in row_resolutions:
                    if res.anomaly_type == 'SETTLEMENT_AS_EXPENSE' and res.resolution_action == 'IMPORT_AS_SETTLEMENT':
                        is_settlement = True
                        break
                
                if is_settlement:
                    # Create Settlement
                    if len(participants) != 1:
                        raise ValueError("Settlements must have exactly one receiver.")
                    
                    receiver = participants[0]
                    # Calculate converted settlement amount
                    exch_rate = get_exchange_rate('INR', currency, exp_date)
                    converted_amount = amount * exch_rate
                    
                    settlement = Settlement.objects.create(
                        group=group,
                        payer=payer_user,
                        receiver=receiver,
                        amount=amount,
                        currency=currency,
                        converted_amount=converted_amount,
                        exchange_rate=exch_rate,
                        date=exp_date,
                        note=description or f"Imported Settlement from CSV: {title}",
                        created_by=executing_user
                    )
                    
                    AuditLog.objects.create(
                        user=executing_user,
                        action='IMPORT_SETTLEMENT_FROM_CSV',
                        target_type='settlement',
                        target_id=str(settlement.id),
                        details={'row_number': row_idx, 'amount': float(amount), 'currency': currency}
                    )
                    
                    successful_imports += 1
                    reports.append({
                        'row': row_idx,
                        'title': title,
                        'status': 'IMPORTED_AS_SETTLEMENT',
                        'id': str(settlement.id)
                    })
                    
                else:
                    # Create Expense
                    # Calculate exchange rate and converted amount
                    exch_rate = get_exchange_rate('INR', currency, exp_date)
                    converted_amount = amount * exch_rate
                    
                    # Check for force equal split override
                    force_equal = False
                    for res in row_resolutions:
                        if res.anomaly_type == 'INCONSISTENT_SPLIT' and res.resolution_action == 'FORCE_EQUAL':
                            force_equal = True
                            break
                    
                    if force_equal:
                        split_type = 'EQUAL'
                        split_details = {}
                    
                    # Create Expense entry
                    expense = Expense.objects.create(
                        group=group,
                        title=title,
                        description=description,
                        amount=amount,
                        currency=currency,
                        payer=payer_user,
                        date=exp_date,
                        split_type=split_type,
                        converted_amount=converted_amount,
                        exchange_rate=exch_rate,
                        created_by=executing_user
                    )
                    
                    # Process Split shares
                    # We map user instance to their split detail input
                    user_splits = {}
                    for p_name, val in split_details.items():
                        # match input name to resolved user
                        p_user = resolve_user_for_import(p_name, group, global_user_mappings, executing_user)
                        user_splits[p_user] = val
                    
                    # Calculate participant amounts
                    calculate_and_create_participants(expense, participants, split_type, user_splits)
                    
                    AuditLog.objects.create(
                        user=executing_user,
                        action='IMPORT_EXPENSE_FROM_CSV',
                        target_type='expense',
                        target_id=str(expense.id),
                        details={'row_number': row_idx, 'title': title, 'amount': float(amount)}
                    )
                    
                    successful_imports += 1
                    reports.append({
                        'row': row_idx,
                        'title': title,
                        'status': 'IMPORTED_AS_EXPENSE',
                        'id': str(expense.id)
                    })
                    
            except Exception as ex:
                logger.exception(f"Failed importing row {row_idx}")
                failed_imports += 1
                reports.append({
                    'row': row_idx,
                    'title': row.get('title', 'Unknown'),
                    'status': 'FAILED',
                    'error': str(ex)
                })
                
    # Update job stats
    import_job.successful_imports = successful_imports
    import_job.failed_imports = failed_imports
    import_job.status = 'COMPLETED'
    import_job.save()
    
    # Save Final Report
    report_summary = {
        'timestamp': timezone.now().isoformat(),
        'total_rows': import_job.total_rows,
        'successful_imports': successful_imports,
        'failed_imports': failed_imports,
        'row_details': reports,
        'anomalies_resolved': [
            {
                'id': str(a.id),
                'row': a.row_number,
                'type': a.anomaly_type,
                'action': a.resolution_action
            }
            for a in import_job.anomalies.exclude(status='PENDING')
        ]
    }
    
    ImportReport.objects.create(
        import_job=import_job,
        report_data=report_summary
    )
    
    return report_summary

def resolve_user_for_import(username, group, global_user_mappings, executing_user):
    """
    Finds or creates a user based on the name and global user mappings.
    """
    raw_lower = username.lower().strip()
    if raw_lower in global_user_mappings:
        return global_user_mappings[raw_lower]
        
    # Default fallback: look up or auto-create as inactive shell user
    user = User.objects.filter(username__iexact=username).first()
    if not user:
        user = User.objects.create(
            username=username,
            email=f"{username.lower().replace(' ', '_')}@example.com",
            is_active=False
        )
        user.set_unusable_password()
        user.save()
        
    global_user_mappings[raw_lower] = user
    return user

def ensure_membership_active(user, group, event_date, row_resolutions):
    """
    Ensures the user has an active membership on event_date in the group.
    """
    membership = GroupMembership.objects.filter(group=group, user=user).first()
    
    # Check if membership violation resolution was to AUTO_JOIN_OR_EXTEND
    resolve_extend = False
    for res in row_resolutions:
        if res.anomaly_type == 'MEMBERSHIP_VIOLATION' and user.username in res.description:
            if res.resolution_action == 'AUTO_JOIN_OR_EXTEND':
                resolve_extend = True
                break
                
    event_datetime = timezone.make_aware(datetime.combine(event_date, datetime.min.time()))
    
    if not membership:
        # Create membership
        join_time = event_datetime
        GroupMembership.objects.create(
            group=group,
            user=user,
            joined_at=join_time
        )
    else:
        # Extend joined_at / left_at
        modified = False
        if event_datetime < membership.joined_at:
            if resolve_extend or True:  # enforce extending if error bypassed or resolved
                membership.joined_at = event_datetime
                modified = True
        if membership.left_at and event_datetime > membership.left_at:
            if resolve_extend or True:
                membership.left_at = None
                modified = True
        if modified:
            membership.save()

def calculate_and_create_participants(expense, participants, split_type, user_splits):
    """
    Calculates the exact share per participant and saves ExpenseParticipant rows.
    """
    amount = expense.amount
    original_currency = expense.currency
    exch_rate = expense.exchange_rate
    num_p = len(participants)
    
    if num_p == 0:
        raise ValueError("Cannot split expense among 0 participants.")
        
    calculated_participants = [] # stores (user, original_amount, percentage, share)
    
    if split_type == 'EQUAL':
        # Split equally
        eq_amount = amount / Decimal(num_p)
        for user in participants:
            calculated_participants.append((
                user,
                eq_amount,
                Decimal(100) / Decimal(num_p),
                Decimal(1)
            ))
            
    elif split_type == 'UNEQUAL':
        # Custom amounts
        # user_splits holds {user_instance: amount_value}
        for user in participants:
            owes = user_splits.get(user, Decimal('0.00'))
            pct = (owes / amount) * Decimal(100) if amount > 0 else Decimal('0.00')
            calculated_participants.append((
                user,
                owes,
                pct,
                None
            ))
            
    elif split_type == 'PERCENTAGE':
        # Percentage based
        # user_splits holds {user_instance: percentage_value}
        for user in participants:
            pct = user_splits.get(user, Decimal('0.00'))
            owes = (pct / Decimal(100)) * amount
            calculated_participants.append((
                user,
                owes,
                pct,
                None
            ))
            
    elif split_type == 'SHARE':
        # Share based split
        # user_splits holds {user_instance: share_multiplier}
        total_shares = sum(user_splits.values())
        if total_shares <= 0:
            total_shares = Decimal(num_p)
            user_splits = {u: Decimal(1) for u in participants}
            
        for user in participants:
            shares = user_splits.get(user, Decimal('1'))
            owes = (shares / total_shares) * amount
            calculated_participants.append((
                user,
                owes,
                (shares / total_shares) * Decimal(100),
                shares
            ))
            
    else:
        raise ValueError(f"Unknown split type {split_type}")
        
    # Build the database records
    # Adjust for rounding errors: sum of participant amounts must equal total amount
    total_split_original = sum(item[1] for item in calculated_participants)
    diff = amount - total_split_original
    
    # Apply rounding difference to the first participant to maintain balance consistency
    if abs(diff) > 0 and len(calculated_participants) > 0:
        first = calculated_participants[0]
        calculated_participants[0] = (
            first[0],
            first[1] + diff,
            first[2],
            first[3]
        )
        
    # Write entries
    for user, orig_owe, pct, share in calculated_participants:
        conv_owe = orig_owe * exch_rate
        ExpenseParticipant.objects.create(
            expense=expense,
            user=user,
            amount=conv_owe,
            percentage=pct,
            share=share,
            original_amount=orig_owe
        )

def auto_resolve_job_anomalies(import_job_id):
    """
    Intelligently resolves all pending anomalies for an import job:
    - DUPLICATE: Resolves to 'IGNORED' (skips duplicate row)
    - UNKNOWN_MEMBER:
      - Searches for a case-insensitive username match or substring match in active users.
      - If found, resolves to MAP_TO_USER:<username>.
      - If not, resolves to CREATE_SHELL_USER.
    - MEMBERSHIP_VIOLATION: Resolves to 'AUTO_JOIN_OR_EXTEND'.
    - SETTLEMENT_AS_EXPENSE: Resolves to 'IMPORT_AS_SETTLEMENT'.
    - INCONSISTENT_SPLIT: Resolves to 'FORCE_EQUAL'.
    - All others: Resolves to 'IGNORED' or 'APPROVED' based on severity.
    """
    import re
    import_job = ImportJob.objects.get(id=import_job_id)
    anomalies = import_job.anomalies.filter(status='PENDING')
    
    # Get all active system users to match usernames
    all_users = list(User.objects.all())
    db_users = {u.username.lower(): u.username for u in all_users}
    
    # 1. Extract all unique unknown names from UNKNOWN_MEMBER anomalies
    unknown_member_anomalies = [a for a in anomalies if a.anomaly_type == 'UNKNOWN_MEMBER']
    
    raw_names = set()
    for anomaly in unknown_member_anomalies:
        match = re.search(r"username '([^']+)'", anomaly.description)
        if match:
            raw_names.add(match.group(1).strip())
            
    # We want to group these raw_names and map each raw_name to a target username.
    raw_name_to_target = {}
    
    def find_matching_username(raw_name, existing_names):
        raw_lower = raw_name.lower().strip()
        
        # 1. Exact case-insensitive match
        for name in existing_names:
            if name.lower().strip() == raw_lower:
                return name
                
        # 2. Substring / token match (e.g. "Priya s" matches "Priya")
        raw_tokens = raw_lower.split()
        for name in existing_names:
            name_lower = name.lower().strip()
            name_tokens = name_lower.split()
            
            # Match first token (e.g., "Priya" first word matches "Priya s")
            if raw_tokens and name_tokens and raw_tokens[0] == name_tokens[0]:
                return name
                
            # Prefix matches
            if len(name_lower) >= 3 and len(raw_lower) >= 3:
                if raw_lower.startswith(name_lower) or name_lower.startswith(raw_lower):
                    return name
                    
        return None
        
    # Process raw_names sorted by length (shorter names like "Priya" first, then "Priya s")
    for raw_name in sorted(raw_names, key=len):
        raw_lower = raw_name.lower()
        
        # A) Check database match first
        db_match = find_matching_username(raw_name, db_users.values())
        if db_match:
            raw_name_to_target[raw_name] = db_match
            continue
            
        # B) Check already established targets
        target_match = find_matching_username(raw_name, raw_name_to_target.values())
        if target_match:
            raw_name_to_target[raw_name] = target_match
            continue
            
        # C) Otherwise, establish a new target (canonical name)
        canonical = raw_name.strip()
        if canonical:
            canonical = canonical[0].upper() + canonical[1:]
        raw_name_to_target[raw_name] = canonical

    count = 0
    created_targets = set()
    
    # Process UNKNOWN_MEMBER anomalies first to populate resolutions
    for anomaly in unknown_member_anomalies:
        unknown_name = None
        match = re.search(r"username '([^']+)'", anomaly.description)
        if match:
            unknown_name = match.group(1).strip()
            
        if unknown_name:
            target = raw_name_to_target.get(unknown_name)
            if target:
                # If target is in db_users, just map to it
                if target.lower() in db_users:
                    action_val = f"MAP_TO_USER:{target}"
                else:
                    # Target is a new shell user. Exactly one anomaly for this target gets CREATE_SHELL_USER
                    if target not in created_targets:
                        action_val = "CREATE_SHELL_USER"
                        created_targets.add(target)
                    else:
                        action_val = f"MAP_TO_USER:{target}"
            else:
                action_val = "CREATE_SHELL_USER"
        else:
            action_val = "CREATE_SHELL_USER"
            
        anomaly.resolution_action = action_val
        anomaly.status = 'RESOLVED' if action_val else 'PENDING'
        anomaly.resolved_at = timezone.now()
        anomaly.save()
        count += 1
        
    # Process all other anomalies
    other_anomalies = [a for a in anomalies if a.anomaly_type != 'UNKNOWN_MEMBER']
    for anomaly in other_anomalies:
        action_val = None
        
        # 1. Duplicate
        if anomaly.anomaly_type == 'DUPLICATE':
            action_val = 'IGNORED'
            
        # 2. Membership Violation
        elif anomaly.anomaly_type == 'MEMBERSHIP_VIOLATION':
            action_val = 'AUTO_JOIN_OR_EXTEND'
            
        # 3. Settlement as Expense
        elif anomaly.anomaly_type == 'SETTLEMENT_AS_EXPENSE':
            action_val = 'IMPORT_AS_SETTLEMENT'
            
        # 4. Inconsistent Split
        elif anomaly.anomaly_type == 'INCONSISTENT_SPLIT':
            action_val = 'FORCE_EQUAL'
            
        # Default fallback
        else:
            action_val = 'IGNORED' if anomaly.severity == 'ERROR' else 'APPROVED'
            
        anomaly.resolution_action = action_val
        anomaly.status = 'RESOLVED' if action_val else 'PENDING'
        anomaly.resolved_at = timezone.now()
        anomaly.save()
        count += 1
        
    return count
