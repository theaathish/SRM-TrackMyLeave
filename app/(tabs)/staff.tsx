import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Animated,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Card, CardContent } from '@/components/ui/Card';
import { getCurrentUser } from '@/lib/auth';
import { getLeaveRequests, LeaveRequest } from '@/lib/firestore';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Users,
  Calendar,
  Clock,
  ChevronRight,
  TrendingUp,
  UserCheck,
  Search,
  Filter,
  X,
} from 'lucide-react-native';

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
  const searchSectionRef = useRef<View>(null);

  const [user, setUser] = useState<any>(null);
  const [staffStats, setStaffStats] = useState<StaffStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [showDepartmentFilter, setShowDepartmentFilter] = useState(false);

  // Animation values
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(30));
  const [statsScaleAnim] = useState(new Animated.Value(0.8));
  const [filterSlideAnim] = useState(new Animated.Value(-100));

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

  // Animate department filter
  useEffect(() => {
    Animated.timing(filterSlideAnim, {
      toValue: showDepartmentFilter ? 0 : -100,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showDepartmentFilter]);

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

      const stats = usersSnapshot.docs.map((doc) => {
        const userData = doc.data();
        const userRequests = allRequests.filter((req) => req.userId === doc.id);

        let totalDaysApproved = 0;
        userRequests.forEach((req) => {
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
          pendingRequests: userRequests.filter(
            (req) => req.status === 'Pending'
          ).length,
          approvedRequests: userRequests.filter(
            (req) => req.status === 'Approved'
          ).length,
          deniedRequests: userRequests.filter(
            (req) => req.status === 'Rejected'
          ).length,
          totalDaysApproved,
          leaveCount: userRequests.filter((req) => req.requestType === 'Leave')
            .length,
          permissionCount: userRequests.filter(
            (req) => req.requestType === 'Permission'
          ).length,
          onDutyCount: userRequests.filter(
            (req) => req.requestType === 'On Duty'
          ).length,
          compensationCount: userRequests.filter(
            (req) => req.requestType === 'Compensation'
          ).length,
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

  // Get unique departments
  const departments = useMemo(() => {
    const depts = [
      ...new Set(staffStats.map((staff) => staff.department)),
    ].filter(Boolean);
    return depts.sort();
  }, [staffStats]);

  // Filter staff based on search query and department
  const filteredStaff = useMemo(() => {
    let filtered = staffStats;

    // Filter by search query (name)
    if (searchQuery.trim()) {
      filtered = filtered.filter((staff) =>
        staff.userName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by department
    if (selectedDepartment) {
      filtered = filtered.filter(
        (staff) => staff.department === selectedDepartment
      );
    }

    return filtered;
  }, [staffStats, searchQuery, selectedDepartment]);

  // Calculate overview stats based on ALL data (not filtered)
  const overviewStats = useMemo(() => {
    const totalStaff = staffStats.length;
    const totalPendingRequests = staffStats.reduce(
      (sum, staff) => sum + staff.pendingRequests,
      0
    );
    const totalDaysApproved = staffStats.reduce(
      (sum, staff) => sum + staff.totalDaysApproved,
      0
    );
    const totalRequests = staffStats.reduce(
      (sum, staff) => sum + staff.totalRequests,
      0
    );

    return {
      totalStaff,
      totalPendingRequests,
      totalDaysApproved,
      totalRequests,
    };
  }, [staffStats]);

  // Auto-scroll to results when searching
  const scrollToResults = useCallback(() => {
    if (staffListAnchorRef.current && scrollViewRef.current) {
      setTimeout(() => {
        staffListAnchorRef.current?.measureLayout(
          scrollViewRef.current as any,
          (x, y) => {
            scrollViewRef.current?.scrollTo({
              y: y - 10, // Small offset from the top
              animated: true,
            });
          },
          () => {} // Error callback
        );
      }, 100); // Small delay to ensure layout is complete
    }
  }, []);

  // Auto-scroll when search query or department filter changes
  useEffect(() => {
    if (searchQuery.trim() || selectedDepartment) {
      scrollToResults();
    }
  }, [searchQuery, selectedDepartment, scrollToResults]);

  // Navigate to home page with animation
  const navigateToHome = () => {
    router.push('/(tabs)/');
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedDepartment('');
  };

  // Toggle department filter visibility
  const toggleDepartmentFilter = () => {
    setShowDepartmentFilter(!showDepartmentFilter);
  };

  // Handle department selection and close dropdown
  const handleDepartmentSelect = (dept: string) => {
    setSelectedDepartment(dept);
    setShowDepartmentFilter(false); // Close dropdown after selection
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

          {/* Search and Filter Section - MOVED HERE AFTER STATS */}
          <View ref={searchSectionRef} style={styles.searchContainer}>
            {/* Search Input */}
            <View style={styles.searchInputContainer}>
              <Search size={20} color="#6B7280" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search faculty by name..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#9CA3AF"
              />
              {searchQuery ? (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  style={styles.clearButton}
                >
                  <X size={16} color="#6B7280" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Filter Controls */}
            <View style={styles.filterControls}>
              <TouchableOpacity
                style={[
                  styles.filterButton,
                  showDepartmentFilter && styles.filterButtonActive,
                ]}
                onPress={toggleDepartmentFilter}
                activeOpacity={0.7}
              >
                <Filter
                  size={16}
                  color={showDepartmentFilter ? '#3B82F6' : '#6B7280'}
                />
                <Text
                  style={[
                    styles.filterButtonText,
                    showDepartmentFilter && styles.filterButtonTextActive,
                  ]}
                >
                  Department
                </Text>
              </TouchableOpacity>

              {searchQuery || selectedDepartment ? (
                <TouchableOpacity
                  style={styles.clearFiltersButton}
                  onPress={clearFilters}
                  activeOpacity={0.7}
                >
                  <Text style={styles.clearFiltersText}>Clear All</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Department Filter Dropdown */}
            <Animated.View
              style={[
                styles.departmentFilter,
                { transform: [{ translateY: filterSlideAnim }] },
              ]}
            >
              {showDepartmentFilter && (
                <View style={styles.departmentOptions}>
                  <TouchableOpacity
                    style={[
                      styles.departmentOption,
                      !selectedDepartment && styles.departmentOptionActive,
                    ]}
                    onPress={() => handleDepartmentSelect('')}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.departmentOptionText,
                        !selectedDepartment &&
                          styles.departmentOptionTextActive,
                      ]}
                    >
                      All Departments
                    </Text>
                  </TouchableOpacity>
                  {departments.map((dept) => (
                    <TouchableOpacity
                      key={dept}
                      style={[
                        styles.departmentOption,
                        selectedDepartment === dept &&
                          styles.departmentOptionActive,
                      ]}
                      onPress={() => handleDepartmentSelect(dept)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.departmentOptionText,
                          selectedDepartment === dept &&
                            styles.departmentOptionTextActive,
                        ]}
                      >
                        {dept}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </Animated.View>
          </View>

          {/* Active Filters Display */}
          {(searchQuery || selectedDepartment) && (
            <View style={styles.activeFilters}>
              <Text style={styles.activeFiltersLabel}>Active Filters:</Text>
              {searchQuery && (
                <View style={styles.filterTag}>
                  <Text style={styles.filterTagText}>
                    Name: "{searchQuery}"
                  </Text>
                </View>
              )}
              {selectedDepartment && (
                <View style={styles.filterTag}>
                  <Text style={styles.filterTagText}>
                    Dept: {selectedDepartment}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Staff List Anchor */}
          <View ref={staffListAnchorRef} style={styles.sectionAnchor} />

          {/* Faculty List */}
          <View style={styles.sectionHeader}>
            <UserCheck size={20} color="#3B82F6" />
            <Text style={styles.sectionTitle}>
              Faculty Members ({filteredStaff.length})
            </Text>
          </View>

          {/* No Results Message */}
          {filteredStaff.length === 0 && (
            <Card style={styles.noResultsCard}>
              <CardContent style={styles.noResultsContent}>
                <Text style={styles.noResultsText}>
                  No faculty members found matching your criteria.
                </Text>
                <TouchableOpacity
                  onPress={clearFilters}
                  style={styles.clearFiltersInlineButton}
                >
                  <Text style={styles.clearFiltersInlineText}>
                    Clear Filters
                  </Text>
                </TouchableOpacity>
              </CardContent>
            </Card>
          )}

          {/* Faculty List */}
          {filteredStaff.map((staff) => (
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
                        <Text style={styles.statItemNumber}>
                          {staff.totalRequests}
                        </Text>
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
  // Search and Filter Styles
  searchContainer: {
    marginBottom: 12,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: '#111827',
  },
  clearButton: {
    padding: 4,
  },
  filterControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterButtonActive: {
    backgroundColor: '#EBF4FF',
    borderColor: '#3B82F6',
  },
  filterButtonText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: '#3B82F6',
  },
  clearFiltersButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearFiltersText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '500',
  },
  departmentFilter: {
    overflow: 'hidden',
  },
  departmentOptions: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  departmentOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  departmentOptionActive: {
    backgroundColor: '#EBF4FF',
  },
  departmentOptionText: {
    fontSize: 14,
    color: '#374151',
  },
  departmentOptionTextActive: {
    color: '#3B82F6',
    fontWeight: '500',
  },
  activeFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  activeFiltersLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginRight: 8,
  },
  filterTag: {
    backgroundColor: '#EBF4FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  filterTagText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '500',
  },
  noResultsCard: {
    marginBottom: 16,
  },
  noResultsContent: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noResultsText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  clearFiltersInlineButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  clearFiltersInlineText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
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
    marginTop: 8,
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
