import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getLeaveRequests, LeaveRequest } from '@/lib/firestore';
import { collection, getDoc, doc } from 'firebase/firestore';
import { getCurrentUser, updateUserProfile } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { Users, Calendar as CalendarIcon, Clock, ChevronLeft, X } from 'lucide-react-native';

// Color scheme for different leave types
const leaveColors = {
  
  'Casual': '#10B981', // Green
  'Medical': '#EF4444', // Red
  'Emergency': '#F59E0B', // Orange
  'Permission': '#8B5CF6', // Purple
  'On Duty': '#06B6D4', // Cyan
  'Compensation': '#6366F1', // Indigo
};

// Loading component
function LoadingScreen() {
  return (
    <SafeAreaView style={styles.loadingContainer}>
      <View style={styles.loadingContent}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading staff details...</Text>
      </View>
    </SafeAreaView>
  );
}

// Calendar component using react-native-calendars
function CalendarView({ requests, onDatePress }: { requests: LeaveRequest[], onDatePress: (date: string, dayRequests: LeaveRequest[]) => void }) {
  
  // Create marked dates object for the calendar
  const markedDates = useMemo(() => {
    const marked: any = {};
    
    requests.forEach(request => {
      if (request.status === 'Approved') {
        const fromDate = new Date(request.fromDate);
        const toDate = request.toDate ? new Date(request.toDate) : fromDate;
        
        // Get the color for this leave type (use first leave type for circle color)
        const leaveType = request.leaveSubType || request.requestType;
        const color = leaveColors[leaveType as keyof typeof leaveColors] || '#6B7280';
        
        // Add all dates in the range
        const currentDate = new Date(fromDate);
        while (currentDate <= toDate) {
          const dateKey = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD format
          
          // Always use circle styling, no dots or numbers
          marked[dateKey] = {
            selected: true,
            selectedColor: color,
            selectedTextColor: '#FFFFFF',
          };
          
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
    });
    
    return marked;
  }, [requests]);

  // Create a map of dates to leave requests for onDayPress
  const dateRequestMap = useMemo(() => {
    const map: { [key: string]: LeaveRequest[] } = {};
    
    requests.forEach(request => {
      if (request.status === 'Approved') {
        const fromDate = new Date(request.fromDate);
        const toDate = request.toDate ? new Date(request.toDate) : fromDate;
        
        const currentDate = new Date(fromDate);
        while (currentDate <= toDate) {
          const dateKey = currentDate.toISOString().split('T')[0];
          if (!map[dateKey]) map[dateKey] = [];
          map[dateKey].push(request);
          currentDate.setDate(currentDate.getDate() + 1);
        }
      }
    });
    
    return map;
  }, [requests]);

  const handleDayPress = (day: any) => {
    const dateKey = day.dateString;
    const dayRequests = dateRequestMap[dateKey] || [];
    if (dayRequests.length > 0) {
      onDatePress(dateKey, dayRequests);
    }
  };
  
  return (
    <Card style={styles.calendarCard}>
      <CardHeader>
        <Text style={styles.calendarTitle}>Leave Calendar</Text>
      </CardHeader>
      <CardContent>
        <Calendar
          markedDates={markedDates}
          onDayPress={handleDayPress}
          theme={{
            backgroundColor: '#ffffff',
            calendarBackground: '#ffffff',
            textSectionTitleColor: '#b6c1cd',
            selectedDayBackgroundColor: '#3B82F6',
            selectedDayTextColor: '#ffffff',
            todayTextColor: '#3B82F6',
            dayTextColor: '#2d4150',
            textDisabledColor: '#d9e1e8',
            dotColor: '#3B82F6',
            selectedDotColor: '#ffffff',
            arrowColor: '#3B82F6',
            disabledArrowColor: '#d9e1e8',
            monthTextColor: '#2d4150',
            indicatorColor: '#3B82F6',
            textDayFontFamily: 'System',
            textMonthFontFamily: 'System',
            textDayHeaderFontFamily: 'System',
            textDayFontWeight: '500',
            textMonthFontWeight: '700',
            textDayHeaderFontWeight: '600',
            textDayFontSize: 16,
            textMonthFontSize: 18,
            textDayHeaderFontSize: 14
          }}
          hideExtraDays={true}
          firstDay={0} // Sunday as first day
          showWeekNumbers={false}
          disableAllTouchEventsForDisabledDays={true}
        />
      </CardContent>
    </Card>
  );
}

// Legend component
function LeaveLegend() {
  return (
    <Card style={styles.legendCard}>
      <CardHeader>
        <Text style={styles.legendTitle}>Leave Type Legend</Text>
      </CardHeader>
      <CardContent>
        <View style={styles.legendGrid}>
          {Object.entries(leaveColors).map(([type, color]) => (
            <View key={type} style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: color }]} />
              <Text style={styles.legendText}>{type}</Text>
            </View>
          ))}
        </View>
      </CardContent>
    </Card>
  );
}

// Date detail modal
function DateDetailModal({ 
  visible, 
  onClose, 
  date, 
  requests,
  loading 
}: { 
  visible: boolean, 
  onClose: () => void, 
  date: string, 
  requests: LeaveRequest[],
  loading: boolean
}) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved': return '#10B981';
      case 'Pending': return '#F59E0B';
      case 'Rejected': return '#EF4444';
      default: return '#6B7280';
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Leave Details</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color="#6B7280" />
          </TouchableOpacity>
        </View>
        
        <ScrollView style={styles.modalContent}>
          <Text style={styles.selectedDate}>{formatDate(date)}</Text>
          
          {loading ? (
            <View style={styles.modalLoadingContainer}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.modalLoadingText}>Loading leave details...</Text>
            </View>
          ) : (
            requests.map((request, index) => (
              <Card key={index} style={styles.requestCard}>
                <CardContent style={styles.requestContent}>
                  <View style={styles.requestHeader}>
                    <View style={styles.requestTypeContainer}>
                      <View style={[
                        styles.requestTypeIndicator, 
                        { backgroundColor: leaveColors[request.leaveSubType as keyof typeof leaveColors] || leaveColors[request.requestType as keyof typeof leaveColors] }
                      ]} />
                      <Text style={styles.requestType}>
                        {request.leaveSubType || request.requestType}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(request.status) }]}>
                      <Text style={styles.statusText}>{request.status}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.requestDetails}>
                    <View style={styles.detailRow}>
                      <CalendarIcon size={16} color="#6B7280" />
                      <Text style={styles.detailText}>
                        {new Date(request.fromDate).toLocaleDateString()}
                        {request.toDate && request.toDate !== request.fromDate && 
                          ` - ${new Date(request.toDate).toLocaleDateString()}`
                        }
                      </Text>
                    </View>
                    
                    {request.reason && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Reason:</Text>
                        <Text style={styles.detailText}>{request.reason}</Text>
                      </View>
                    )}
                    
                    <View style={styles.detailRow}>
                      <Clock size={16} color="#6B7280" />
                      <Text style={styles.detailText}>
                        Applied: {new Date(request.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                </CardContent>
              </Card>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function StaffDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [staff, setStaff] = useState<any>(null);
  const [viewer, setViewer] = useState<any>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedRequests, setSelectedRequests] = useState<LeaveRequest[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);

  useEffect(() => {
    loadStaffAndRequests();
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        const currentUser = await getCurrentUser();
        setViewer(currentUser);
      } catch (error) {
        console.error('Error getting viewer', error);
      }
    })();
  }, []);

  const loadStaffAndRequests = async () => {
    setLoading(true);
    try {
      // Get staff user info
      const userDoc = await getDoc(doc(db, 'users', id as string));
      setStaff(userDoc.exists() ? { ...userDoc.data(), id: userDoc.id } : null);

      // Get all leave requests for this staff
      const reqs = await getLeaveRequests(id as string);
      setRequests(reqs);
    } catch (error) {
      setStaff(null);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDatePress = (date: string, dayRequests: LeaveRequest[]) => {
    setSelectedDate(date);
    setModalVisible(true);
    setModalLoading(true);
    
    // Add a small delay to show loading state (simulating data processing)
    setTimeout(() => {
      setSelectedRequests(dayRequests);
      setModalLoading(false);
    }, 500);
  };

  const stats = useMemo(() => {
    const stat = {
      total: 0,
      pending: 0,
      approved: 0,
      denied: 0,
      daysApproved: 0,
      leave: 0,
      permission: 0,
      od: 0,
      compensation: 0,
      casual: 0,
      medical: 0,
      emergency: 0,
    };
    requests.forEach(r => {
      stat.total++;
      if (r.status === 'Pending') stat.pending++;
      if (r.status === 'Approved') stat.approved++;
      if (r.status === 'Rejected') stat.denied++;
      if (r.status === 'Approved') {
        if (r.requestType === 'Permission') {
          stat.daysApproved += 0.5;
        } else if (r.toDate) {
          // Set both dates to midnight to ignore time portion
          const from = new Date(r.fromDate);
          const to = new Date(r.toDate);
          from.setHours(0, 0, 0, 0);
          to.setHours(0, 0, 0, 0);
          const diffTime = to.getTime() - from.getTime();
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
          stat.daysApproved += diffDays;
        } else {
          stat.daysApproved += 1;
        }
      }
      if (r.requestType === 'Leave') {
        stat.leave++;
        if (r.leaveSubType === 'Casual') stat.casual++;
        if (r.leaveSubType === 'Medical') stat.medical++;
        if (r.leaveSubType === 'Emergency') stat.emergency++;
      }
      if (r.requestType === 'Permission') stat.permission++;
      if (r.requestType === 'On Duty') stat.od++;
      if (r.requestType === 'Compensation') stat.compensation++;
    });
    return stat;
  }, [requests]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!staff) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Staff not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ChevronLeft size={24} color="#3B82F6" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Card style={styles.infoCard}>
          <CardHeader>
            <Text style={styles.staffName}>{staff.name}</Text>
            <Text style={styles.staffDetails}>{staff.department} • ID: {staff.employeeId}</Text>
          </CardHeader>
          {viewer?.role === 'Director' && (
            <CardContent>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                <Button
                  title={staff.role === 'SubAdmin' ? 'Revoke SubAdmin' : 'Promote to SubAdmin'}
                  onPress={async () => {
                    try {
                      await updateUserProfile(staff.id, { role: staff.role === 'SubAdmin' ? 'Staff' : 'SubAdmin' });
                      Alert.alert('Success', 'User role updated');
                      // refresh staff data
                      const userDoc = await getDoc(doc(db, 'users', id as string));
                      setStaff(userDoc.exists() ? { ...userDoc.data(), id: userDoc.id } : null);
                    } catch (err) {
                      console.error('Error changing role', err);
                      Alert.alert('Error', 'Failed to change role');
                    }
                  }}
                />
              </View>
            </CardContent>
          )}
        </Card>

        {/* Calendar Section - Using react-native-calendars */}
        <CalendarView requests={requests} onDatePress={handleDatePress} />
        
        {/* Legend */}
        <LeaveLegend />

        {/* Statistics Section */}
        <Card style={styles.statsCard}>
          <CardContent>
            <Text style={styles.sectionTitle}>Leave Statistics</Text>
            <View style={styles.statsBox}>
              <View style={styles.statRowBox}>
                <Text style={styles.statLabelBox}>Pending</Text>
                <Text style={styles.statValueBox}>{stats.pending}</Text>
              </View>
              <View style={styles.statRowBox}>
                <Text style={styles.statLabelBox}>Approved</Text>
                <Text style={styles.statValueBox}>{stats.approved}</Text>
              </View>
              <View style={styles.statRowBox}>
                <Text style={styles.statLabelBox}>Denied</Text>
                <Text style={styles.statValueBox}>{stats.denied}</Text>
              </View>
              <View style={styles.statRowBox}>
                <Text style={styles.statLabelBox}>Total Days Taken</Text>
                <Text style={styles.statValueBox}>{stats.daysApproved}</Text>
              </View>
            </View>
            
            <Text style={styles.sectionTitle}>Leave Type Breakdown</Text>
            <View style={styles.statsBox}>
              <View style={styles.statRowBox}>
                <Text style={styles.statLabelBox}>Casual Leave</Text>
                <Text style={styles.statValueBox}>{stats.casual}</Text>
              </View>
              <View style={styles.statRowBox}>
                <Text style={styles.statLabelBox}>Medical Leave</Text>
                <Text style={styles.statValueBox}>{stats.medical}</Text>
              </View>
              <View style={styles.statRowBox}>
                <Text style={styles.statLabelBox}>Emergency Leave</Text>
                <Text style={styles.statValueBox}>{stats.emergency}</Text>
              </View>
              <View style={styles.statRowBox}>
                <Text style={styles.statLabelBox}>Permission</Text>
                <Text style={styles.statValueBox}>{stats.permission}</Text>
              </View>
              <View style={styles.statRowBox}>
                <Text style={styles.statLabelBox}>On Duty</Text>
                <Text style={styles.statValueBox}>{stats.od}</Text>
              </View>
              <View style={styles.statRowBox}>
                <Text style={styles.statLabelBox}>Compensation</Text>
                <Text style={styles.statValueBox}>{stats.compensation}</Text>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Date Detail Modal */}
        <DateDetailModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          date={selectedDate}
          requests={selectedRequests}
          loading={modalLoading}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

export default StaffDetailScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16, paddingBottom: 32 },
  
  // Loading Styles
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  
  // Error Styles
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#EF4444',
    fontWeight: '600',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  
  backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backText: { color: '#3B82F6', fontWeight: '600', marginLeft: 4, fontSize: 16 },
  infoCard: { marginBottom: 24 },
  staffName: { fontSize: 22, fontWeight: '700', color: '#111827' },
  staffDetails: { fontSize: 15, color: '#6B7280', marginBottom: 8 },
  sectionTitle: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#111827', 
    marginTop: 16, 
    marginBottom: 16 
  },
  statsCard: { marginBottom: 24 },
  statsBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  statRowBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statLabelBox: {
    fontSize: 16,
    color: '#1E40AF',
    fontWeight: '600',
  },
  statValueBox: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '700',
  },
  
  // Calendar Styles
  calendarCard: {
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  calendarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  
  // Legend Styles
  legendCard: {
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  legendTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    minWidth: '48%',
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
    marginRight: 8,
  },
  legendText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  selectedDate: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 20,
    textAlign: 'center',
  },
  requestCard: {
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#E5E7EB',
  },
  requestContent: {
    padding: 16,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  requestTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  requestTypeIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  requestType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  requestDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  detailText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  
  // Modal Loading Styles
  modalLoadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  modalLoadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
});