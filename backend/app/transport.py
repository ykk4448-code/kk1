"""Civilian multimodal task dependencies and end-to-end consignment projection."""
from collections import defaultdict


def vehicle_mode(vehicle):
    return 'sea' if vehicle['category']=='ship' else 'road'


def dependency_order(tasks):
    pending={t['id']:t for t in tasks};done=set();ordered=[]
    key=lambda t:(t['priority'],t['deadline_min'],t['code'])
    while pending:
        ready=[t for t in pending.values() if not t.get('predecessor_task_id') or t['predecessor_task_id'] in done or t['predecessor_task_id'] not in pending]
        if not ready:
            ordered.extend(sorted(pending.values(),key=key));break
        task=min(ready,key=key);ordered.append(task);done.add(task['id']);del pending[task['id']]
    return ordered


def shipment_projection(tasks,timeline,minute):
    grouped=defaultdict(list);records={t['task_id']:t for t in timeline}
    for task in tasks:
        if task.get('shipment_id'):grouped[task['shipment_id']].append(task)
    result=[]
    for sid,items in sorted(grouped.items()):
        items.sort(key=lambda t:t['leg_index']);legs=[]
        for task in items:
            record=records.get(task['id'])
            status='unassigned' if not record else 'waiting'
            if record and minute>=record['actual_start_min']:
                status='in_transit'
                if record['actual_end_min'] is not None and minute>=record['actual_end_min']:
                    status='delivered' if record['outcome']=='arrived' else 'failed'
            legs.append({**task,'status':status,'vehicle_code':record.get('vehicle_code','') if record else '',
                         'planned_end_min':record.get('end_min') if record else None,
                         'actual_end_min':record.get('actual_end_min') if record else None})
        statuses=[leg['status'] for leg in legs]
        status='failed' if 'failed' in statuses else 'unassigned' if 'unassigned' in statuses else 'delivered' if all(s=='delivered' for s in statuses) else 'transferring' if 'delivered' in statuses and 'in_transit' not in statuses else 'in_transit' if any(s in ('in_transit','delivered') for s in statuses) else 'waiting'
        result.append({'id':sid,'cargo':items[0]['cargo'],'weight_kg':items[0]['weight_kg'],
                       'origin':items[0]['origin'],'destination':items[-1]['destination'],
                       'status':status,'completed_legs':statuses.count('delivered'),'legs':legs})
    return result
