import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Card, CardContent } from '@/components/ui/Card';
import { getCurrentUser } from '@/lib/auth';
import { getLeaveRequests, LeaveRequest } from '@/lib/firestore';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Users, Calendar, Clock, ChevronRight, TrendingUp, UserCheck } from 'lucide-react-native';

interface StaffStats {
  userId: string;
  userName: string;
  department: string;
  employeeId: string;
  totalRequests: number;
  pendingRequests: number;
  approvedRequests: number;
  deniedRequests: number;
  totalDaysApproved: number;
  leaveCount: number;
  permissionCount: number;
  onDutyCount: number;
  compensationCount: number;
}

export default function StaffScreen() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const staffListAnchorRef = useRef<View>(null);
  
  const [user, setUser] = useState<any>(null);
  const [staffStats, setStaffStats] = useState<StaffStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Animation values
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(30));
  const [statsScaleAnim] = useState(new Animated.Value(0.8));

  useEffect(() => {
    loadData();
    
    // Start animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(statsScaleAnim, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) throw new Error('User not found');
      
      if (currentUser.role !== 'Director') {
        router.replace('/(tabs)/');
        return;
      }
      
      setUser(currentUser);
      
      // Load all requests and calculate staff stats
      const allRequests = await getLeaveRequests();
      
      // Get all staff users
      const usersSnapshot = await getDocs(
        query(collection(db, 'users'), where('role', '==', 'Staff'))
      );
      
      const stats = usersSnapshot.docs.map(doc => {
        const userData = doc.data();
        const userRequests = allRequests.filter(req => req.userId === doc.id);
        
        let totalDaysApproved = 0;
        userRequests.forEach(req => {
          if (req.status === 'Approved') {
            if (req.requestType === 'Permission') {
              totalDaysApproved += 0.5; // Permission counts as half day
            } else if (req.toDate) {
              const diffTime = req.toDate.getTime() - req.fromDate.getTime();
              const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
              totalDaysApproved += diffDays;
            } else {
              totalDaysApproved += 1;
            }
          }
        });
        
        return {
          userId: doc.id,
          userName: userData.name,
          department: userData.department,
          employeeId: userData.employeeId,
          totalRequests: userRequests.length,
          pendingRequests: userRequests.filter(req => req.status === 'Pending').length,
          approvedRequests: userRequests.filter(req => req.status === 'Approved').length,
          deniedRequests: userRequests.filter(req => req.status === 'Rejected').length,
          totalDaysApproved,
          leaveCount: userRequests.filter(req => req.requestType === 'Leave').length,
          permissionCount: userRequests.filter(req => req.requestType === 'Permission').length,
          onDutyCount: userRequests.filter(req => req.requestType === 'On Duty').length,
          compensationCount: userRequests.filter(req => req.requestType === 'Compensation').length,
        } as StaffStats;
      });
      
      setStaffStats(stats.sort((a, b) => b.totalRequests - a.totalRequests));
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [router]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Calculate overview stats
  const overviewStats = useMemo(() => {
    const totalStaff = staffStats.length;
    const totalPendingRequests = staffStats.reduce((sum, staff) => sum + staff.pendingRequests, 0);
    const totalDaysApproved = staffStats.reduce((sum, staff) => sum + staff.totalDaysApproved, 0);
    const totalRequests = staffStats.reduce((sum, staff) => sum + staff.totalRequests, 0);
    
    return {
      totalStaff,
      totalPendingRequests,
      totalDaysApproved,
      totalRequests,
    };
  }, [staffStats]);

  const scrollToSection = (ref: React.RefObject<View>) => {
    if (ref.current && scrollViewRef.current) {
      ref.current.measureLayout(
        scrollViewRef.current as any,
        (x, y) => {
          scrollViewRef.current?.scrollTo({ y: y - 20, animated: true });
        }
      );
    }
  };

  // Navigate to home page with animation
  const navigateToHome = () => {
    router.push('/(tabs)/');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading staff data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View 
        style={[
          styles.animatedContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Faculty Overview</Text>
            <Text style={styles.subtitle}>
              Manage and monitor faculty leave requests
            </Text>
          </View>

          {/* Stats Cards - All navigate to home page */}
          <Animated.View 
            style={[
              styles.statsContainer,
              { transform: [{ scale: statsScaleAnim }] },
            ]}
          >
            {/* Total Staff - Navigate to Home */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={navigateToHome}
              style={styles.statButton}
            >
              <Card style={[styles.statCard, styles.primaryCard]}>
                <CardContent style={styles.statContent}>
                  <Users size={24} color="#3B82F6" />
                  <Text style={[styles.statNumber, styles.primaryNumber]}>
                    {overviewStats.totalStaff}
                  </Text>
                  <Text style={styles.statLabel}>Total Faculty</Text>
                </CardContent>
              </Card>
            </TouchableOpacity>

            {/* Pending Requests - Navigate to Home */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={navigateToHome}
              style={styles.statButton}
            >
              <Card style={[styles.statCard, styles.warningCard]}>
                <CardContent style={styles.statContent}>
                  <Clock size={24} color="#F59E0B" />
                  <Text style={[styles.statNumber, styles.warningNumber]}>
                    {overviewStats.totalPendingRequests}
                  </Text>
                  <Text style={styles.statLabel}>Pending</Text>
                </CardContent>
              </Card>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View 
            style={[
              styles.statsContainer,
              { transform: [{ scale: statsScaleAnim }] },
            ]}
          >
            {/* Days Approved - Navigate to Home */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={navigateToHome}
              style={styles.statButton}
            >
              <Card style={[styles.statCard, styles.successCard]}>
                <CardContent style={styles.statContent}>
                  <Calendar size={24} color="#10B981" />
                  <Text style={[styles.statNumber, styles.successNumber]}>
                    {overviewStats.totalDaysApproved}
                  </Text>
                  <Text style={styles.statLabel}>Days Approved</Text>
                </CardContent>
              </Card>
            </TouchableOpacity>

            {/* Total Requests - Navigate to Home */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={navigateToHome}
              style={styles.statButton}
            >
              <Card style={[styles.statCard, styles.infoCard]}>
                <CardContent style={styles.statContent}>
                  <TrendingUp size={24} color="#8B5CF6" />
                  <Text style={[styles.statNumber, styles.infoNumber]}>
                    {overviewStats.totalRequests}
                  </Text>
                  <Text style={styles.statLabel}>Total Requests</Text>
                </CardContent>
              </Card>
            </TouchableOpacity>
          </Animated.View>

          {/* Staff List Anchor */}
          <View ref={staffListAnchorRef} style={styles.sectionAnchor} />

          {/* Faculty List */}
          <View style={styles.sectionHeader}>
            <UserCheck size={20} color="#3B82F6" />
            <Text style={styles.sectionTitle}>Faculty Members</Text>
          </View>

          {staffStats.map(staff => (
            <TouchableOpacity
              key={staff.userId}
              onPress={() => router.push(`/staff/${staff.userId}`)}
              activeOpacity={0.85}
            >
              <Card style={styles.staffCard}>
                <CardContent>
                  <View style={styles.staffHeader}>
                    <View style={styles.staffInfo}>
                      <Text style={styles.staffName}>{staff.userName}</Text>
                      <Text style={styles.staffDetails}>
                        {staff.department} • ID: {staff.employeeId}
                      </Text>
                    </View>
                    <ChevronRight size={20} color="#6B7280" />
                  </View>

                  <View style={styles.staffStats}>
                    <View style={styles.statRow}>
                      <View style={styles.statItem}>
                        <Text style={[styles.statItemNumber, styles.pending]}>
                          {staff.pendingRequests}
                        </Text>
                        <Text style={styles.statItemLabel}>Pending</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={[styles.statItemNumber, styles.approved]}>
                          {staff.totalDaysApproved}
                        </Text>
                        <Text style={styles.statItemLabel}>Days Approved</Text>
                      </View>
                      <View style={styles.statItem}>
                        <Text style={styles.statItemNumber}>{staff.totalRequests}</Text>
                        <Text style={styles.statItemLabel}>Total Requests</Text>
                      </View>
                    </View>
                  </View>
                </CardContent>
              </Card>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  animatedContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#6B7280',
    fontSize: 16,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  statButton: {
    flex: 1,
  },
  statCard: {
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  primaryCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  warningCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  successCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  infoCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#8B5CF6',
  },
  statContent: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  primaryNumber: {
    color: '#3B82F6',
  },
  warningNumber: {
    color: '#F59E0B',
  },
  successNumber: {
    color: '#10B981',
  },
  infoNumber: {
    color: '#8B5CF6',
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
  },
  sectionAnchor: {
    height: 1,
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginLeft: 8,
  },
  staffCard: {
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  staffHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  staffInfo: {
    flex: 1,
  },
  staffName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  staffDetails: {
    fontSize: 14,
    color: '#6B7280',
  },
  staffStats: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statItemNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  pending: {
    color: '#F59E0B',
  },
  approved: {
    color: '#10B981',
  },
  statItemLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
});