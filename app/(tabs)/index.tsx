import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, RefreshControl, TouchableOpacity, FlatList, Animated, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, CardContent } from '@/components/ui/Card';
import { LeaveRequestCard as LeaveRequestCardBase } from '@/components/LeaveRequestCard';
// Memoized LeaveRequestCard for performance
const LeaveRequestCard = React.memo(LeaveRequestCardBase);
import { getCurrentUser } from '@/lib/auth';
import { getLeaveRequests, LeaveRequest } from '@/lib/firestore';
import { FileText, Users, Calendar, Clock, TrendingUp } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'Staff' | 'Director';
  department: string;
}

export default function HomeScreen() {
  const [user, setUser] = useState<User | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const containerRef = useRef<View>(null);
  const pendingAnchorRef = useRef<View>(null);
  const approvedHeaderRef = useRef<View>(null);
  const deniedHeaderRef = useRef<View>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<{ [key: string]: boolean }>({
    approved: false,
    denied: false,
  });

  // Animation values for enhanced view
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(30));
  const [statsScaleAnim] = useState(new Animated.Value(0.8));

  // Add missing memoized values for filtering requests
  const pendingRequests = useMemo(() => requests.filter(r => r.status === 'Pending'), [requests]);
  const approvedRequests = useMemo(() => requests.filter(r => r.status === 'Approved'), [requests]);
  const deniedRequests = useMemo(() => requests.filter(r => r.status === 'Rejected'), [requests]);

  // Director-specific stats
  const directorStats = useMemo(() => {
    if (user?.role !== 'Director') return null;
    
    return {
      totalRequests: requests.length,
      pendingCount: pendingRequests.length,
      approvedCount: approvedRequests.length,
      deniedCount: deniedRequests.length,
    };
  }, [requests, pendingRequests, approvedRequests, deniedRequests, user]);

  const loadUserData = useCallback(async () => {
    setLoading(true);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) throw new Error('User not found');
      setUser(currentUser);
      
      // Load requests once
      await loadRequests(currentUser);
      
      // Start animations for director view
      if (currentUser.role === 'Director') {
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
      }
    } catch (err: any) {
      console.error('Error loading user data:', err);
      Alert.alert('Error', 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Simple request loading function
  const loadRequests = useCallback(async (currentUser: User) => {
    try {
      console.log('Loading requests (manual)...');
      const requestsData = await getLeaveRequests(
        currentUser.role === 'Staff' ? currentUser.id : undefined
      );
      setRequests(requestsData);
      console.log(`Loaded ${requestsData.length} requests`);
    } catch (error: any) {
      console.error('Failed to load requests:', error);
      Alert.alert('Error', 'Failed to load requests. Please try again.');
    }
  }, []);

  // Simple refresh function
  const onRefresh = useCallback(async () => {
    if (refreshing || !user) return;
    
    setRefreshing(true);
    
    // Haptic feedback
    try {
      const { impactAsync, ImpactFeedbackStyle } = await import('expo-haptics');
      impactAsync(ImpactFeedbackStyle.Light);
    } catch (error) {
      // Haptics not available
    }
    
    await loadRequests(user);
    setRefreshing(false);
  }, [user, refreshing, loadRequests]);

  // Simple scroll to section function
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

  // Remove real-time useEffect, keep only simple focus effect
  useFocusEffect(
    useCallback(() => {
      console.log('Screen focused, loading data...');
      loadUserData();
    }, [loadUserData])
  );

  // Optimistic update handler (for immediate UI feedback only)
  const handleOptimisticUpdate = useCallback((requestId: string, status: 'Approved' | 'Rejected') => {
    setRequests(prevRequests => 
      prevRequests.map(request => 
        request.id === requestId 
          ? { ...request, status, updatedAt: new Date() }
          : request
      )
    );
  }, []);

  // Simple refresh control
  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={['#3B82F6']} // Android
      tintColor="#3B82F6" // iOS
      title="Pull to refresh"
    />
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Director view with animations and scroll navigation
  if (user?.role === 'Director') {
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
            refreshControl={refreshControl}
            showsVerticalScrollIndicator={false}
          >
            {/* Enhanced Header for Director */}
            <View style={styles.directorHeader}>
              <Text style={styles.directorWelcomeText}>Director Dashboard</Text>
              <Text style={styles.directorSubtitle}>Welcome, {user?.name} • {user?.department}</Text>
            </View>

            {/* Animated Stats Cards with navigation */}
            <Animated.View 
              style={[
                styles.directorStatsContainer,
                { transform: [{ scale: statsScaleAnim }] },
              ]}
            >
              {/* Total Requests - Navigate to Approved */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setExpanded(e => ({ ...e, approved: true }));
                  setTimeout(() => scrollToSection(approvedHeaderRef), 100);
                }}
                style={styles.directorStatButton}
              >
                <Card style={[styles.directorStatCard, styles.primaryCard]}>
                  <CardContent style={styles.directorStatContent}>
                    <TrendingUp size={24} color="#3B82F6" />
                    <Text style={[styles.directorStatNumber, styles.primaryNumber]}>
                      {directorStats?.totalRequests || 0}
                    </Text>
                    <Text style={styles.directorStatLabel}>Total Requests</Text>
                  </CardContent>
                </Card>
              </TouchableOpacity>

              {/* Pending Requests - Navigate to Pending */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => scrollToSection(pendingAnchorRef)}
                style={styles.directorStatButton}
              >
                <Card style={[styles.directorStatCard, styles.warningCard]}>
                  <CardContent style={styles.directorStatContent}>
                    <Clock size={24} color="#F59E0B" />
                    <Text style={[styles.directorStatNumber, styles.warningNumber]}>
                      {directorStats?.pendingCount || 0}
                    </Text>
                    <Text style={styles.directorStatLabel}>Pending</Text>
                  </CardContent>
                </Card>
              </TouchableOpacity>
            </Animated.View>

            <Animated.View 
              style={[
                styles.directorStatsContainer,
                { transform: [{ scale: statsScaleAnim }] },
              ]}
            >
              {/* Approved Requests - Navigate to Approved */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setExpanded(e => ({ ...e, approved: true }));
                  setTimeout(() => scrollToSection(approvedHeaderRef), 100);
                }}
                style={styles.directorStatButton}
              >
                <Card style={[styles.directorStatCard, styles.successCard]}>
                  <CardContent style={styles.directorStatContent}>
                    <Calendar size={24} color="#10B981" />
                    <Text style={[styles.directorStatNumber, styles.successNumber]}>
                      {directorStats?.approvedCount || 0}
                    </Text>
                    <Text style={styles.directorStatLabel}>Approved</Text>
                  </CardContent>
                </Card>
              </TouchableOpacity>

              {/* Denied Requests - Navigate to Denied */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setExpanded(e => ({ ...e, denied: true }));
                  setTimeout(() => scrollToSection(deniedHeaderRef), 100);
                }}
                style={styles.directorStatButton}
              >
                <Card style={[styles.directorStatCard, styles.dangerCard]}>
                  <CardContent style={styles.directorStatContent}>
                    <FileText size={24} color="#EF4444" />
                    <Text style={[styles.directorStatNumber, styles.dangerNumber]}>
                      {directorStats?.deniedCount || 0}
                    </Text>
                    <Text style={styles.directorStatLabel}>Denied</Text>
                  </CardContent>
                </Card>
              </TouchableOpacity>
            </Animated.View>

            {/* Pending Requests Anchor */}
            <View ref={pendingAnchorRef} style={styles.sectionAnchor} />

            {/* Pending Requests Section */}
            <View style={styles.directorSectionHeader}>
              <Clock size={20} color="#F59E0B" />
              <Text style={styles.directorSectionTitle}>Pending Requests</Text>
            </View>

            <View style={styles.directorPendingContainer}>
              <FlatList
                data={pendingRequests}
                keyExtractor={item => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <LeaveRequestCard
                    request={item}
                    isDirector={true}
                    onUpdate={onRefresh}
                    onOptimisticUpdate={handleOptimisticUpdate}
                  />
                )}
                ListEmptyComponent={
                  <View style={styles.emptyStateContainer}>
                    <Clock size={48} color="#9CA3AF" />
                    <Text style={styles.emptyStateText}>No pending requests</Text>
                  </View>
                }
              />
            </View>

            {/* Approved Requests Section */}
            <View ref={approvedHeaderRef} style={styles.sectionAnchor} />
            
            <TouchableOpacity
              style={styles.expandableHeader}
              onPress={() => setExpanded(e => ({ ...e, approved: !e.approved }))}
              activeOpacity={0.7}
            >
              <View style={styles.directorSectionHeader}>
                <Calendar size={20} color="#10B981" />
                <Text style={styles.directorSectionTitle}>Approved Requests</Text>
              </View>
              <Text style={styles.expandToggle}>
                {expanded.approved ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>

            {expanded.approved && (
              <FlatList
                data={approvedRequests}
                keyExtractor={item => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <LeaveRequestCard
                    request={item}
                    isDirector={true}
                    onUpdate={onRefresh}
                    onOptimisticUpdate={handleOptimisticUpdate}
                  />
                )}
                ListEmptyComponent={
                  <View style={styles.emptyStateContainer}>
                    <Calendar size={48} color="#9CA3AF" />
                    <Text style={styles.emptyStateText}>No approved requests</Text>
                  </View>
                }
              />
            )}

            {/* Denied Requests Section */}
            <View ref={deniedHeaderRef} style={styles.sectionAnchor} />
            
            <TouchableOpacity
              style={styles.expandableHeader}
              onPress={() => setExpanded(e => ({ ...e, denied: !e.denied }))}
              activeOpacity={0.7}
            >
              <View style={styles.directorSectionHeader}>
                <FileText size={20} color="#EF4444" />
                <Text style={styles.directorSectionTitle}>Denied Requests</Text>
              </View>
              <Text style={styles.expandToggle}>
                {expanded.denied ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>

            {expanded.denied && (
              <FlatList
                data={deniedRequests}
                keyExtractor={item => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <LeaveRequestCard
                    request={item}
                    isDirector={true}
                    onUpdate={onRefresh}
                    onOptimisticUpdate={handleOptimisticUpdate}
                  />
                )}
                ListEmptyComponent={
                  <View style={styles.emptyStateContainer}>
                    <FileText size={48} color="#9CA3AF" />
                    <Text style={styles.emptyStateText}>No denied requests</Text>
                  </View>
                }
              />
            )}
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
    );
  }

  // Staff view - simplified design
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View ref={containerRef} style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.welcomeText}>Welcome, {user?.name}</Text>
            <Text style={styles.roleText}>{user?.department} • Faculty</Text>
          </View>

          <View ref={approvedHeaderRef} collapsable={false} />
          
          {/* Stats as navigation buttons */}
          <View style={styles.statsContainer}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                setExpanded(e => ({ ...e, approved: true, denied: true }));
                setTimeout(() => {
                  if (approvedHeaderRef.current && containerRef.current && scrollViewRef.current) {
                    approvedHeaderRef.current.measureLayout(
                      containerRef.current,
                      (x, y) => scrollViewRef.current?.scrollTo({ y, animated: true })
                    );
                  }
                }, 250);
              }}
              style={styles.statButton}
            >
              <Card style={styles.statCard}>
                <CardContent style={styles.statContent}>
                  <Text style={styles.statNumber}>{requests.length}</Text>
                  <Text style={styles.statLabel}>My Requests</Text>
                </CardContent>
              </Card>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                if (scrollViewRef.current) {
                  const headerHeight = 100;
                  const statsHeight = 120;
                  const targetY = headerHeight + statsHeight + 40;
                  
                  scrollViewRef.current.scrollTo({ 
                    y: targetY, 
                    animated: true 
                  });
                }
              }}
              style={styles.statButton}
            >
              <Card style={styles.statCard}>
                <CardContent style={styles.statContent}>
                  <Text style={[styles.statNumber, styles.pendingNumber]}>
                    {pendingRequests.length}
                  </Text>
                  <Text style={styles.statLabel}>Pending</Text>
                </CardContent>
              </Card>
            </TouchableOpacity>
          </View>

          <View style={{ height: 20 }} />
          
          <View ref={pendingAnchorRef} collapsable={false} style={{ height: 1 }} />
          
          {/* Pending Requests - Container hidden but content visible */}
          <View style={styles.pendingRequestsContainer}>
            {/* Pending Requests Section */}
            <Text style={styles.sectionTitle}>Pending Requests</Text>
            <FlatList
              data={pendingRequests}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <LeaveRequestCard
                  request={item}
                  isDirector={false}
                  onUpdate={onRefresh}
                  onOptimisticUpdate={handleOptimisticUpdate}
                />
              )}
              ListEmptyComponent={
                <View style={styles.emptyStateContainer}>
                  <FileText size={48} color="#9CA3AF" />
                  <Text style={styles.emptyStateText}>No pending requests</Text>
                </View>
              }
            />
          </View>

          {/* Approved Requests - outside the pending container */}
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setExpanded(e => ({ ...e, approved: !e.approved }))}
            accessibilityRole="button"
            accessibilityLabel="Toggle Approved Requests"
            activeOpacity={0.7}
          >
            <Text style={styles.sectionTitle}>Approved Requests</Text>
            <Text style={styles.sectionToggle}>{expanded.approved ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          
          {expanded.approved && (
            <FlatList
              data={approvedRequests}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <LeaveRequestCard
                  request={item}
                  isDirector={false}
                  onUpdate={onRefresh}
                  onOptimisticUpdate={handleOptimisticUpdate}
                />
              )}
              ListEmptyComponent={
                <View style={styles.emptyStateContainer}>
                  <Calendar size={48} color="#9CA3AF" />
                  <Text style={styles.emptyStateText}>No approved requests</Text>
                </View>
              }
            />
          )}

          {/* Denied Requests - outside the pending container */}
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setExpanded(e => ({ ...e, denied: !e.denied }))}
            accessibilityRole="button"
            accessibilityLabel="Toggle Denied Requests"
            activeOpacity={0.7}
          >
            <Text style={styles.sectionTitle}>Denied Requests</Text>
            <Text style={styles.sectionToggle}>{expanded.denied ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          
          {expanded.denied && (
            <FlatList
              data={deniedRequests}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <LeaveRequestCard
                  request={item}
                  isDirector={false}
                  onUpdate={onRefresh}
                  onOptimisticUpdate={handleOptimisticUpdate}
                />
              )}
              ListEmptyComponent={
                <View style={styles.emptyStateContainer}>
                  <FileText size={48} color="#9CA3AF" />
                  <Text style={styles.emptyStateText}>No denied requests</Text>
                </View>
              }
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    flexGrow: 1,
  },
  header: {
    marginBottom: 24,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  roleText: {
    fontSize: 16,
    color: '#6B7280',
  },
  directorHeader: {
    marginBottom: 24,
  },
  directorWelcomeText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  directorSubtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  directorStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  directorStatButton: {
    flex: 1,
  },
  directorStatCard: {
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
  directorStatContent: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
    position: 'relative',
  },
  directorStatNumber: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  primaryNumber: {
    color: '#3B82F6',
  },
  warningNumber: {
    color: '#F59E0B',
  },
  directorStatLabel: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
  },
  directorSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  directorSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginLeft: 8,
  },
  expandableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
    marginBottom: 16,
  },
  expandToggle: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 8,
  },
  statButton: {
    flex: 1,
  },
  statCard: {
    flex: 1,
  },
  statContent: {
    alignItems: 'center',
    paddingVertical: 16,
    position: 'relative',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3B82F6',
  },
  pendingNumber: {
    color: '#F59E0B',
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 8,
    marginTop: 24,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  sectionToggle: {
    fontSize: 18,
    color: '#6B7280',
    marginLeft: 8,
  },
  requestCardWrapper: {
    marginBottom: 16,
    borderRadius: 14,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    padding: 8,
  },
  emptyStateContainer: {
    marginVertical: 24,
    alignItems: 'center',
  },
  emptyStateText: {
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },
  // Enhanced loading and refresh styles
  loadingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    color: '#6B7280',
    fontSize: 16,
    marginTop: 12,
    fontWeight: '500',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLoader: {
    marginLeft: 8,
  },
  statLoader: {
    marginTop: 8,
    position: 'absolute',
    bottom: 8,
  },
  sectionHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  animatedContainer: {
    flex: 1,
  },
  successCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  dangerCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  successNumber: {
    color: '#10B981',
  },
  dangerNumber: {
    color: '#EF4444',
  },
  sectionAnchor: {
    height: 1,
    marginTop: 24,
  },
  directorPendingContainer: {
    minHeight: 800, // Increased from 600 to 800
    marginBottom: 32,
  },
  // Hidden container styling - content visible but container styling removed
  pendingRequestsContainer: {
    // Remove all container styling (background, borders, padding, shadows)
    backgroundColor: 'transparent',
    borderRadius: 0,
    padding: 0,
    marginBottom: 32,
    minHeight: 270,
    // Remove shadows and borders
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    borderWidth: 0,
    borderColor: 'transparent',
  },
});