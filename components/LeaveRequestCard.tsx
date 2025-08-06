import React, { useState, useEffect } from 'react';
import { View, Text, Alert, StyleSheet } from 'react-native';
import { Card, CardContent, CardFooter } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { StatusBadge } from './StatusBadge';
import { Check, X, FileText, Calendar, User } from 'lucide-react-native';
import { updateLeaveRequestStatus } from '@/lib/firestore';
import { LeaveRequest } from '@/lib/firestore';
import { getWorkingDaysBetween } from '@/lib/holidays';

interface LeaveRequestCardProps {
  request: LeaveRequest;
  isDirector?: boolean;
  onUpdate?: () => void;
  onOptimisticUpdate?: (requestId: string, status: 'Approved' | 'Rejected') => void;
}

function LeaveRequestCardComponent({ request, isDirector, onUpdate, onOptimisticUpdate }: LeaveRequestCardProps) {
  const [loading, setLoading] = useState(false);
  const [workingDays, setWorkingDays] = useState<number | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);

  useEffect(() => {
    if (request.requestType !== 'Permission' && request.toDate) {
      calculateWorkingDays();
    }
  }, [request]);

  const calculateWorkingDays = async () => {
    try {
      const days = await getWorkingDaysBetween(request.fromDate, request.toDate!);
      setWorkingDays(days);
    } catch (error) {
      console.error('Error calculating working days:', error);
      setWorkingDays(null);
    }
  };

  const handleApprove = async () => {
    if (loading) return; // Prevent double-tap
    
    setLoading(true);
    setOptimisticStatus('Approved');
    
    // Optimistic update for immediate UI feedback
    onOptimisticUpdate?.(request.id, 'Approved');
    
    try {
      await updateLeaveRequestStatus(
        request.id, 
        'Approved',
        undefined,
        undefined,
        () => {
          // Success callback for immediate UI update
          console.log('Request approved, updating UI immediately');
        }
      );
      
      Alert.alert(
        'Success ✅', 
        'Leave request approved successfully',
        [{ text: 'OK', style: 'default' }],
        { cancelable: true }
      );
      
      // Update parent component
      onUpdate?.();
    } catch (error) {
      console.error('Error approving request:', error);
      setOptimisticStatus(null); // Revert optimistic update
      Alert.alert('Error', 'Failed to approve request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = async () => {
    if (loading) return; // Prevent double-tap
    
    setLoading(true);
    setOptimisticStatus('Rejected');
    
    // Optimistic update for immediate UI feedback
    onOptimisticUpdate?.(request.id, 'Rejected');
    
    try {
      await updateLeaveRequestStatus(
        request.id, 
        'Rejected',
        undefined,
        undefined,
        () => {
          // Success callback for immediate UI update
          console.log('Request denied, updating UI immediately');
        }
      );
      
      Alert.alert(
        'Success ❌', 
        'Leave request denied',
        [{ text: 'OK', style: 'default' }],
        { cancelable: true }
      );
      
      // Update parent component
      onUpdate?.();
    } catch (error) {
      console.error('Error denying request:', error);
      setOptimisticStatus(null); // Revert optimistic update
      Alert.alert('Error', 'Failed to deny request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const calculateDuration = () => {
    if (request.requestType === 'Permission') {
      if (request.fromTime && request.toTime) {
        const [fromHour, fromMinute] = request.fromTime.split(':').map(Number);
        const [toHour, toMinute] = request.toTime.split(':').map(Number);
        const fromMinutes = fromHour * 60 + fromMinute;
        const toMinutes = toHour * 60 + toMinute;
        const diffMinutes = toMinutes - fromMinutes;
        if (diffMinutes <= 0) return 'N/A';
        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;
        if (hours > 0 && minutes > 0) {
          return `${hours}h ${minutes}m`;
        } else if (hours > 0) {
          return `${hours}h`;
        } else {
          return `${minutes}m`;
        }
      }
      return 'N/A';
    } else {
      if (!request.toDate) return '1 day';
      
      const diffTime = request.toDate.getTime() - request.fromDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      
      if (workingDays !== null) {
        if (workingDays === 0) {
          return 'No working days';
        } else if (workingDays === 1) {
          return `1 working day${diffDays > 1 ? ` (${diffDays} total)` : ''}`;
        } else {
          return `${workingDays} working days${diffDays !== workingDays ? ` (${diffDays} total)` : ''}`;
        }
      }
      
      return `${diffDays} days`;
    }
  };

  const formatTime = (time: string) => {
    if (!time) return '';
    const [hour, minute] = time.split(':');
    const hourNum = parseInt(hour);
    const ampm = hourNum >= 12 ? 'PM' : 'AM';
    const displayHour = hourNum % 12 || 12;
    return `${displayHour}:${minute} ${ampm}`;
  };

  // Use optimistic status if available
  const displayStatus = optimisticStatus || request.status;

  return (
    <>
      <Card style={[
        styles.card,
        optimisticStatus && styles.optimisticCard
      ]}>
        <CardContent>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {isDirector && (
                <View style={styles.userInfo}>
                  <User size={16} color="#6B7280" />
                  <Text style={styles.userName}>
                    {request.userName}
                  </Text>
                </View>
              )}
              <Text style={styles.department}>
                {request.department} • ID: {request.empId}
              </Text>
            </View>
            <StatusBadge status={displayStatus as any} />
          </View>

          <View style={styles.leaveTypeContainer}>
            <View style={styles.leaveTypeLeft}>
              <Text style={styles.leaveType}>
                {request.requestType === 'Permission' ? 'Permission' : 
                 request.requestType === 'Leave' ? `${request.leaveSubType || 'Casual'} Leave` : 
                 request.requestType === 'On Duty' ? 'On Duty' :
                 request.requestType === 'Compensation' ? 'Compensation' :
                 request.requestType}
              </Text>
            </View>
            <View style={styles.daysContainer}>
              <Calendar size={14} color="#6B7280" />
              <Text style={styles.daysText}>{calculateDuration()}</Text>
            </View>
          </View>

          <View style={styles.dateContainer}>
            <Text style={styles.dateLabel}>
              {request.requestType === 'Permission' ? 'Date & Time' : 'Duration'}
            </Text>
            {request.requestType === 'Permission' ? (
              <Text style={styles.dateValue}>
                {formatDate(request.fromDate)} • {formatTime(request.fromTime || '')} - {formatTime(request.toTime || '')}
              </Text>
            ) : (
              <Text style={styles.dateValue}>
                {formatDate(request.fromDate)}{request.toDate && request.toDate.getTime() !== request.fromDate.getTime() ? ` → ${formatDate(request.toDate)}` : ''}
              </Text>
            )}
          </View>
          
          <View style={styles.reasonContainer}>
            <Text style={styles.reasonLabel}>Reason</Text>
            <Text style={styles.reasonText}>{request.reason}</Text>
          </View>

          {request.fileUrl && (
            <View style={styles.fileContainer}>
              <FileText size={16} color="#3B82F6" />
              <Text style={styles.fileText}>Supporting document attached</Text>
            </View>
          )}

          {request.remark && (
            <View style={styles.remarkContainer}>
              <Text style={styles.remarkLabel}>Director's Remark</Text>
              <Text style={styles.remarkText}>{request.remark}</Text>
            </View>
          )}
          
          {/* Loading indicator for optimistic updates */}
          {optimisticStatus && (
            <View style={styles.optimisticIndicator}>
              <Text style={styles.optimisticText}>
                {optimisticStatus === 'Approved' ? '✅ Approving...' : '❌ Denying...'}
              </Text>
            </View>
          )}
        </CardContent>

        {isDirector && request.status === 'Pending' && !optimisticStatus && (
          <CardFooter style={styles.footer}>
            <View style={styles.buttonRow}>
              <Button
                title="✅ Approve"
                onPress={handleApprove}
                variant="success"
                size="sm"
                icon={<Check size={16} color="white" />}
                loading={loading && optimisticStatus === 'Approved'}
                disabled={loading}
                style={[styles.actionButton, styles.approveButton]}
              />
              <Button
                title="❌ Deny"
                onPress={handleDeny}
                variant="danger"
                size="sm"
                icon={<X size={16} color="white" />}
                loading={loading && optimisticStatus === 'Rejected'}
                disabled={loading}
                style={[styles.actionButton, styles.denyButton]}
              />
            </View>
          </CardFooter>
        )}
      </Card>
    </>
  );
}

export const LeaveRequestCard = React.memo(
  LeaveRequestCardComponent,
  (prev, next) =>
    prev.request.id === next.request.id &&
    prev.request.status === next.request.status &&
    prev.isDirector === next.isDirector
);

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginLeft: 6,
  },
  department: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  leaveTypeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
  },
  leaveTypeLeft: {
    flexDirection: 'column',
  },
  leaveType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
  },
  requestType: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  daysContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  daysText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 4,
    fontWeight: '500',
  },
  dateContainer: {
    marginBottom: 16,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  dateValue: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  reasonContainer: {
    marginBottom: 16,
  },
  reasonLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 15,
    color: '#111827',
    lineHeight: 22,
  },
  fileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    marginBottom: 16,
  },
  fileText: {
    fontSize: 14,
    color: '#3B82F6',
    marginLeft: 8,
    fontWeight: '500',
  },
  remarkContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  remarkLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#991B1B',
    marginBottom: 4,
  },
  remarkText: {
    fontSize: 15,
    color: '#7F1D1D',
    lineHeight: 22,
  },
  footer: {
    backgroundColor: '#FAFAFA',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
  optimisticCard: {
    opacity: 0.8,
    borderColor: '#3B82F6',
    borderWidth: 2,
  },
  optimisticIndicator: {
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  optimisticText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
  },
  approveButton: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  denyButton: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
});