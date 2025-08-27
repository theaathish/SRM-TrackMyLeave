import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, RefreshControl, TouchableOpacity, FlatList, Animated, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, CardContent } from '@/components/ui/Card';
import { LeaveRequestCard as LeaveRequestCardBase } from '@/components/LeaveRequestCard';
// Memoized LeaveRequestCard for performance
const LeaveRequestCard = React.memo(LeaveRequestCardBase);
import { getCurrentUser } from '@/lib/auth';
import { getLeaveRequests, LeaveRequest } from '@/lib/firestore';
import { FileText, Users, Calendar, Clock, TrendingUp, ChevronUp } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, router } from 'expo-router';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'Staff' | 'Director';
  department: string;
}

export default function HomeScreen() {
  const { notificationType } = useLocalSearchParams<{ notificationType?: string }>();
  const [user, setUser] = useState<User | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const containerRef = useRef<View>(null);
  const pendingAnchorRef = useRef<View>(null);
  const approvedHeaderRef = useRef<View>(null);
  const deniedHeaderRef = useRef<View>(null);
  const allRequestsRef = useRef<View>(null); // New ref for "My Requests" section
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<{ [key: string]: boolean }>({
    approved: false,
    denied: false,
  });
  const [sectionLoading, setSectionLoading] = useState<{ [key: string]: boolean }>({});
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  // Animation values for enhanced view
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(30));
  const [statsScaleAnim] = useState(new Animated.Value(0.8));

  console.log("notification Home:", notificationType);

  // Handle notification type on mount
  useEffect(() => {
    if (notificationType) {
      // Set expanded state based on notification type
      setExpanded({
        approved: notificationType === 'approved',
        denied: notificationType === 'rejected',
      });
    }
  }, [notificationType]);

  // Scroll to section after expanding - Fixed version
  useEffect(() => {
    if (notificationType && requests.length > 0) {
      const timer = setTimeout(() => {
        if (notificationType === 'approved') {
          scrollToSection('approved');
        } else if (notificationType === 'rejected') {
          scrollToSection('denied');
        }
      }, 500); // Increased delay to ensure content is rendered

      return () => clearTimeout(timer);
    }
  }, [expanded, notificationType, requests]);

  // Add missing memoized values for filtering requests
  const pendingRequests = useMemo(() => requests.filter(r => r.status === 'Pending'), [requests]);
  const approvedRequests = useMemo(() => requests.filter(r => r.status === 'Approved'), [requests]);
  const deniedRequests = useMemo(() => requests.filter(r => r.status === 'Rejected'), [requests]);

  // Calculate leave type statistics for each pending request
  const pendingRequestsWithStats = useMemo(() => {
    return pendingRequests.map(pendingRequest => {
      // Count approved requests of the same type and subtype
      const sameTypeApproved = approvedRequests.filter(approved => {
        // For regular leave, match both leaveType and leaveSubType
        if (pendingRequest.leaveType === 'Leave' && approved.leaveType === 'Leave') {
          return approved.leaveSubType === pendingRequest.leaveSubType;
        }
        // For other types (Permission, On Duty, Compensation), just match leaveType
        return approved.leaveType === pendingRequest.leaveType;
      });

      // Calculate total days taken for this leave type
      const totalDaysTaken = sameTypeApproved.reduce((total, request) => {
        // Extract number from duration string (e.g., "2 working days" -> 2)
        const durationMatch = request.duration?.match(/(\d+)/);
        const days = durationMatch ? parseInt(durationMatch[1], 10) : 1;
        return total + days;
      }, 0);

      return {
        ...pendingRequest,
        previousCount: sameTypeApproved.length,
        totalDaysTaken,
        leaveTypeDisplay: pendingRequest.leaveType === 'Leave'
          ? pendingRequest.leaveSubType || 'Leave'
          : pendingRequest.leaveType
      };
    });
  }, [pendingRequests, approvedRequests]);

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

  // Scroll handler for scroll to top button
  const handleScroll = useCallback((event: any) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    // Show button when scrolled down more than 300px
    setShowScrollToTop(scrollY > 300);
  }, []);

  // Scroll to top function
  const scrollToTop = useCallback(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0, animated: true });
      
      // Optional: Add haptic feedback
      try {
        import('expo-haptics').then(({ impactAsync, ImpactFeedbackStyle }) => {
          impactAsync(ImpactFeedbackStyle.Light);
        });
      } catch (error) {
        // Haptics not available
      }
    }
  }, []);

  // Fixed scroll to section function with better calculations for staff view
  const scrollToSection = useCallback((section: 'pending' | 'approved' | 'denied' | 'all-requests') => {
    if (!scrollViewRef.current) return;

    // Calculate approximate positions based on content structure
    let scrollY = 0;
    
    if (user?.role === 'Director') {
      // Director view calculations (unchanged)
      const headerHeight = 100;
      const statsHeight = 200; // Two rows of stats
      const sectionMargin = 50;
      
      switch (section) {
        case 'pending':
          scrollY = headerHeight + statsHeight + sectionMargin;
          break;
        case 'approved':
          scrollY = headerHeight + statsHeight + sectionMargin + 900; // After pending section
          break;
        case 'denied':
          scrollY = headerHeight + statsHeight + sectionMargin + 1400; // After pending + approved
          break;
      }
    } else {
      // Staff view calculations - FIXED
      const headerHeight = 120; // Welcome text + role
      const statsHeight = 120; // Stats cards height
      const spacingAfterStats = 20; // Space after stats
      const pendingSectionHeight = 300; // Estimated pending section height
      const sectionHeaderHeight = 60; // Each section header height
      const sectionSpacing = 24; // Margin between sections
      
      switch (section) {
        case 'all-requests':
        case 'pending':
          // Scroll to start of pending requests (right after stats)
          scrollY = headerHeight + statsHeight + spacingAfterStats;
          break;
        case 'approved':
          // Scroll to approved section (after pending section)
          scrollY = headerHeight + statsHeight + spacingAfterStats + 
                   pendingSectionHeight + sectionSpacing;
          break;
        case 'denied':
          // Scroll to denied section (after approved section)
          scrollY = headerHeight + statsHeight + spacingAfterStats + 
                   pendingSectionHeight + sectionHeaderHeight + sectionSpacing * 2 + 200;
          break;
      }
    }

    console.log(`Scrolling to ${section} at position ${scrollY}`);
    scrollViewRef.current.scrollTo({ 
      y: Math.max(0, scrollY), 
      animated: true 
    });
  }, [user?.role]);

  // Alternative method using refs with better measurement
  const scrollToSectionWithRef = useCallback((section: 'pending' | 'approved' | 'denied' | 'all-requests') => {
    if (!scrollViewRef.current) return;

    let targetRef: React.RefObject<View> | null = null;
    
    switch (section) {
      case 'all-requests':
      case 'pending':
        targetRef = pendingAnchorRef;
        break;
      case 'approved':
        targetRef = approvedHeaderRef;
        break;
      case 'denied':
        targetRef = deniedHeaderRef;
        break;
    }

    if (!targetRef?.current) {
      console.log('Target ref not found, using manual scroll');
      scrollToSection(section);
      return;
    }

    // Measure the target element position
    targetRef.current.measure((x, y, width, height, pageX, pageY) => {
      console.log(`Measured position for ${section}: pageY=${pageY}`);
      
      if (scrollViewRef.current) {
        // Scroll to the measured position with some offset
        const baseOffset = user?.role === 'Staff' ? 60 : 80;
        // Add extra 75px DOWNWARD (subtract from offset to scroll down more) for "My Requests" navigation
        const extraOffset = section === 'approved' ? -75 : 0;
        const totalOffset = baseOffset + extraOffset;
        
        scrollViewRef.current.scrollTo({ 
          y: Math.max(0, pageY - totalOffset), 
          animated: true 
        });
      }
    });
  }, [scrollToSection, user?.role]);

  // Remove real-time useEffect, keep only simple focus effect
  useFocusEffect(
    useCallback(() => {
      console.log('Screen focused, loading data...');
      loadUserData();
      //onRefresh();
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

  // Enhanced navigation handlers with instant show/hide (no loading states needed)
  const handleNavigateToSection = useCallback((section: 'pending' | 'approved' | 'denied' | 'all-requests') => {
    console.log(`Navigating to ${section} section`);
    
    // Handle different section types - instant expansion, no loading needed
    if (section === 'all-requests') {
      // For "My Requests", expand both approved and denied sections to show ALL requests
      setExpanded(prev => ({ ...prev, approved: true, denied: true }));
      
      // Scroll immediately after state update
      setTimeout(() => {
        scrollToSectionWithRef('approved'); // Scroll to approved requests (center of all requests)
      }, 100); // Minimal delay for state update
    } else if (section === 'approved' || section === 'denied') {
      // For specific sections, just expand that section
      setExpanded(prev => ({ ...prev, [section]: true }));
      
      // Scroll immediately after state update
      setTimeout(() => {
        scrollToSectionWithRef(section);
      }, 100); // Minimal delay for state update
    } else {
      // For pending section, no expansion needed
      setTimeout(() => {
        scrollToSectionWithRef(section);
      }, 50);
    }
  }, [scrollToSectionWithRef]);

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
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            <View ref={containerRef} style={{ flex: 1 }}>
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
                {/* Total Requests - Navigate to ALL requests (both approved and denied) */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => handleNavigateToSection('all-requests')}
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
                  onPress={() => handleNavigateToSection('pending')}
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
                  onPress={() => handleNavigateToSection('approved')}
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
                  onPress={() => handleNavigateToSection('denied')}
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
                  data={pendingRequestsWithStats}
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

              {/* Pre-rendered Approved Requests - Always rendered but conditionally visible */}
              <View style={[
                styles.preRenderedSection,
                { display: expanded.approved ? 'flex' : 'none' }
              ]}>
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
              </View>

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

              {/* Pre-rendered Denied Requests - Always rendered but conditionally visible */}
              <View style={[
                styles.preRenderedSection,
                { display: expanded.denied ? 'flex' : 'none' }
              ]}>
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
              </View>
            </View>
          </ScrollView>
        </Animated.View>
        
        {/* Scroll to Top Button */}
        {showScrollToTop && (
          <TouchableOpacity
            style={styles.scrollToTopButton}
            onPress={scrollToTop}
            activeOpacity={0.8}
          >
            <View style={styles.scrollToTopContent}>
              <ChevronUp size={24} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        )}
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
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        <View ref={containerRef} style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.welcomeText}>Welcome, {user?.name}</Text>
            <Text style={styles.roleText}>{user?.department} • Faculty</Text>
          </View>

          {/* Stats as navigation buttons */}
          <View style={styles.statsContainer}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => handleNavigateToSection('all-requests')} // Changed from 'approved' to 'all-requests'
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
              onPress={() => handleNavigateToSection('pending')}
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

          {/* Anchor for "My Requests" / Pending section */}
          <View ref={pendingAnchorRef} style={styles.sectionAnchor} />

          {/* Pending Requests - Container hidden but content visible */}
          <View style={styles.pendingRequestsContainer}>
            {/* Pending Requests Section */}
            <Text style={styles.sectionTitle}>Pending Requests</Text>
            <FlatList
              data={pendingRequestsWithStats}
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

          {/* Approved Requests - anchor placed right before the header */}
          <View ref={approvedHeaderRef} style={styles.sectionAnchor} />

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

          {/* Pre-rendered Approved Requests - Always rendered but conditionally visible */}
          <View style={[
            styles.preRenderedSection,
            { display: expanded.approved ? 'flex' : 'none' }
          ]}>
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
          </View>

          {/* Denied Requests - anchor placed right before the header */}
          <View ref={deniedHeaderRef} style={styles.sectionAnchor} />

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

          {/* Pre-rendered Denied Requests - Always rendered but conditionally visible */}
          <View style={[
            styles.preRenderedSection,
            { display: expanded.denied ? 'flex' : 'none' }
          ]}>
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
          </View>
        </View>
      </ScrollView>
      
      {/* Scroll to Top Button */}
      {showScrollToTop && (
        <TouchableOpacity
          style={styles.scrollToTopButton}
          onPress={scrollToTop}
          activeOpacity={0.8}
        >
          <View style={styles.scrollToTopContent}>
            <ChevronUp size={24} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      )}
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
  // Pre-rendered section styling
  preRenderedSection: {
    // Section is always rendered but visibility controlled by display property
    flex: 1,
  },
  // Scroll to top button styles
  scrollToTopButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 1000,
  },
  scrollToTopContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 28,
  },
});