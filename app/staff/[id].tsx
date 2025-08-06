import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { getLeaveRequests, LeaveRequest } from '@/lib/firestore';
import { collection, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Users, Calendar, Clock, ChevronLeft } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';

function StaffDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [staff, setStaff] = useState<any>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStaffAndRequests();
  }, [id]);

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
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (!staff) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loadingText}>Staff not found</Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}

export default StaffDetailScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { padding: 16 },
  loadingText: { textAlign: 'center', marginTop: 40, color: '#6B7280', fontSize: 18 },
  backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backText: { color: '#3B82F6', fontWeight: '600', marginLeft: 4, fontSize: 16 },
  infoCard: { marginBottom: 24 },
  staffName: { fontSize: 22, fontWeight: '700', color: '#111827' },
  staffDetails: { fontSize: 15, color: '#6B7280', marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 16, marginBottom: 8 },
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
});
