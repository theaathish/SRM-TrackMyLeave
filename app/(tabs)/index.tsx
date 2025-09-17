import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, RefreshControl, TouchableOpacity, FlatList, Animated, ActivityIndicator, AppState } from 'react-native';
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
  const allRequestsRef = useRef<View>(null);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<{ [key: string]: boolean }>({
    approved: false,
    denied: false,
  });
  const [sectionLoading, setSectionLoading] = useState<{ [key: string]: boolean }>({});
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [isFullyLoaded, setIsFullyLoaded] = useState(false);
  
  // Track if notification auto-scroll was already consumed
  const [notificationConsumed, setNotificationConsumed] = useState(false);
  // Track if we need to scroll after expansion
  const [pendingScrollTarget, setPendingScrollTarget] = useState<string | null>(null);

  // Animation values for enhanced view
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(30));
  const [statsScaleAnim] = useState(new Animated.Value(0.8));

  console.log("notification Home:", notificationType);

  // Clear notification state when navigating away or app goes to background
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        console.log('App going to background, clearing notification state');
        setNotificationConsumed(false);
        setPendingScrollTarget(null);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription?.remove();
    };
  }, []);

  // Clear notification state when screen loses focus (navigation)
  useFocusEffect(
    useCallback(() => {
      console.log('Screen focused, loading data...');
      loadUserData();

      return () => {
        console.log('Screen unfocused, clearing notification state');
        setNotificationConsumed(false);
        setPendingScrollTarget(null);
      };
    }, [])
  );

  // Handle notification type on mount - only for staff and only once
  useEffect(() => {
    if (notificationType && !notificationConsumed && user?.role === 'Staff') {
      console.log('Processing notification for staff:', notificationType);
      
      // Set the target section to scroll to after expansion
      const targetSection = notificationType === 'approved' ? 'approved' : 
                           notificationType === 'rejected' ? 'denied' : null;
      
      if (targetSection) {
        setPendingScrollTarget(targetSection);
        
        // Set expanded state based on notification type
        setExpanded(prev => ({
          ...prev,
          [targetSection]: true,
        }));

        // Mark notification as consumed
        setNotificationConsumed(true);
      }
    }
  }, [notificationType, notificationConsumed, user?.role]);

  // NEW: Effect to handle scrolling after section expansion
  useEffect(() => {
    if (pendingScrollTarget && isFullyLoaded && requests.length > 0) {
      console.log('Triggering delayed scroll to:', pendingScrollTarget);
      
      // Wait for the expansion animation and re-render to complete
      const timer = setTimeout(() => {
        scrollToSectionWithMeasurement(pendingScrollTarget as 'approved' | 'denied');
        setPendingScrollTarget(null); // Clear the pending target
      }, 800); // Increased delay to ensure full rendering

      return () => clearTimeout(timer);
    }
  }, [pendingScrollTarget, isFullyLoaded, requests, expanded]);

  // Add missing memoized values for filtering requests
  const pendingRequests = useMemo(() => requests.filter(r => r.status === 'Pending'), [requests]);
  const approvedRequests = useMemo(() => requests.filter(r => r.status === 'Approved'), [requests]);
  const deniedRequests = useMemo(() => requests.filter(r => r.status === 'Rejected'), [requests]);

  // Calculate leave type statistics for each pending request
  const pendingRequestsWithStats = useMemo(() => {
    return pendingRequests.map(pendingRequest => {
      const sameTypeApproved = approvedRequests.filter(approved => {
        if (pendingRequest.leaveType === 'Leave' && approved.leaveType === 'Leave') {
          return approved.leaveSubType === pendingRequest.leaveSubType;
        }
        return approved.leaveType === pendingRequest.leaveType;
      });

      const totalDaysTaken = sameTypeApproved.reduce((total, request) => {
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
    setIsFullyLoaded(false);
    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) throw new Error('User not found');
      setUser(currentUser);

      await loadRequests(currentUser);

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
        ]).start(() => {
          setIsFullyLoaded(true);
        });
      } else {
        setTimeout(() => {
          setIsFullyLoaded(true);
        }, 500);
      }
    } catch (err: any) {
      console.error('Error loading user data:', err);
      Alert.alert('Error', 'Failed to load data. Please try again.');
      setIsFullyLoaded(true);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const onRefresh = useCallback(async () => {
    if (refreshing || !user) return;

    setRefreshing(true);

    try {
      const { impactAsync, ImpactFeedbackStyle } = await import('expo-haptics');
      impactAsync(ImpactFeedbackStyle.Light);
    } catch (error) {
      // Haptics not available
    }

    await loadRequests(user);
    setRefreshing(false);
  }, [user, refreshing, loadRequests]);

  const handleScroll = useCallback((event: any) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    setShowScrollToTop(scrollY > 300);
  }, []);

  const scrollToTop = useCallback(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0, animated: true });
      
      try {
        import('expo-haptics').then(({ impactAsync, ImpactFeedbackStyle }) => {
          impactAsync(ImpactFeedbackStyle.Light);
        });
      } catch (error) {
        // Haptics not available
      }
    }
  }, []);

  // NEW: Improved scroll function that uses actual measurements
  const scrollToSectionWithMeasurement = useCallback((section: 'approved' | 'denied') => {
    if (!scrollViewRef.current || !isFullyLoaded) {
      console.log('Not ready for scrolling yet');
      return;
    }

    const targetRef = section === 'approved' ? approvedHeaderRef : deniedHeaderRef;
    
    if (!targetRef?.current) {
      console.log('Target ref not found for section:', section);
      return;
    }

    // Use measureInWindow for more accurate positioning
    targetRef.current.measureInWindow((x, y, width, height) => {
      console.log(`Measured ${section} section at window position: x=${x}, y=${y}, height=${height}`);
      
      if (y <= 0) {
        // If measurement failed, try again after a short delay
        setTimeout(() => {
          scrollToSectionWithMeasurement(section);
        }, 300);
        return;
      }
      
      if (scrollViewRef.current) {
        // Calculate the scroll position relative to the ScrollView
        // We need to get the current scroll position and add the measured offset
        scrollViewRef.current.scrollTo({
          y: Math.max(0, y - 100), // 100px offset from top for better visibility
          animated: true
        });
        
        console.log(`Scrolled to ${section} section at position: ${y - 100}`);
        
        // Add haptic feedback
        try {
          import('expo-haptics').then(({ impactAsync, ImpactFeedbackStyle }) => {
            impactAsync(ImpactFeedbackStyle.Medium);
          });
        } catch (error) {
          // Haptics not available
        }
      }
    });
  }, [isFullyLoaded]);

  // ALTERNATIVE: More robust scroll method using measure with retry logic
  const scrollToSectionWithRetry = useCallback((section: 'approved' | 'denied', attempt = 1) => {
    if (!scrollViewRef.current || !containerRef.current) {
      console.log('Refs not ready for scrolling');
      return;
    }

    const targetRef = section === 'approved' ? approvedHeaderRef : deniedHeaderRef;
    
    if (!targetRef?.current) {
      console.log('Target ref not found for section:', section);
      return;
    }

    // Measure the target relative to the container
    targetRef.current.measure((x, y, width, height, pageX, pageY) => {
      console.log(`Attempt ${attempt} - Measured ${section}: pageY=${pageY}, y=${y}`);
      
      if ((pageY <= 0 || y <= 0) && attempt < 5) {
        // Measurement failed or not ready, retry
        console.log(`Measurement not ready, retrying in ${attempt * 200}ms...`);
        setTimeout(() => {
          scrollToSectionWithRetry(section, attempt + 1);
        }, attempt * 200);
        return;
      }
      
      if (scrollViewRef.current && pageY > 0) {
        const scrollOffset = Math.max(0, pageY - 80); // 80px offset for better visibility
        console.log(`Scrolling to ${section} at position: ${scrollOffset}`);
        
        scrollViewRef.current.scrollTo({
          y: scrollOffset,
          animated: true
        });
        
        // Add haptic feedback
        try {
          import('expo-haptics').then(({ impactAsync, ImpactFeedbackStyle }) => {
            impactAsync(ImpactFeedbackStyle.Medium);
          });
        } catch (error) {
          // Haptics not available
        }
      }
    });
  }, []);

  // Legacy scroll function (keeping as fallback)
  const scrollToSection = useCallback((section: 'pending' | 'approved' | 'denied' | 'all-requests') => {
    if (!scrollViewRef.current) return;

    let scrollY = 0;
    
    if (user?.role === 'Director') {
      const headerHeight = 100;
      const statsHeight = 200;
      const sectionMargin = 50;
      
      switch (section) {
        case 'pending':
          scrollY = headerHeight + statsHeight + sectionMargin;
          break;
        case 'approved':
          scrollY = headerHeight + statsHeight + sectionMargin + 900;
          break;
        case 'denied':
          scrollY = headerHeight + statsHeight + sectionMargin + 1400;
          break;
      }
    } else {
      const headerHeight = 120;
      const statsHeight = 120;
      const spacingAfterStats = 20;
      const pendingSectionHeight = 300;
      const sectionHeaderHeight = 60;
      const sectionSpacing = 24;
      
      switch (section) {
        case 'all-requests':
        case 'pending':
          scrollY = headerHeight + statsHeight + spacingAfterStats;
          break;
        case 'approved':
          scrollY = headerHeight + statsHeight + spacingAfterStats + 
                   pendingSectionHeight + sectionSpacing;
          break;
        case 'denied':
          scrollY = headerHeight + statsHeight + spacingAfterStats + 
                   pendingSectionHeight + sectionHeaderHeight + sectionSpacing * 2 + 200;
          break;
      }
    }

    console.log(`Manual scroll to ${section} at position ${scrollY}`);
    scrollViewRef.current.scrollTo({ 
      y: Math.max(0, scrollY), 
      animated: true 
    });
  }, [user?.role]);

  const handleOptimisticUpdate = useCallback((requestId: string, status: 'Approved' | 'Rejected') => {
    setRequests(prevRequests =>
      prevRequests.map(request =>
        request.id === requestId
          ? { ...request, status, updatedAt: new Date() }
          : request
      )
    );
  }, []);

  // Enhanced navigation handlers with better scroll targeting
  const handleNavigateToSection = useCallback((section: 'pending' | 'approved' | 'denied' | 'all-requests') => {
    console.log(`Navigating to ${section} section`);
    
    if (section === 'all-requests') {
      setExpanded(prev => ({ ...prev, approved: true, denied: true }));
      setTimeout(() => {
        scrollToSectionWithRetry('approved');
      }, 300);
    } else if (section === 'approved' || section === 'denied') {
      setExpanded(prev => ({ ...prev, [section]: true }));
      setTimeout(() => {
        scrollToSectionWithRetry(section);
      }, 300);
    } else {
      setTimeout(() => {
        scrollToSection(section);
      }, 50);
    }
  }, [scrollToSectionWithRetry, scrollToSection]);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={['#3B82F6']}
      tintColor="#3B82F6"
      title="Pull to refresh"
    />
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading...</Text>
          {notificationType && user?.role === 'Staff' && !notificationConsumed && (
            <Text style={styles.notificationHint}>
              Preparing to show {notificationType} requests...
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Director view (unchanged)
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
              <View style={styles.directorHeader}>
                <Text style={styles.directorWelcomeText}>Director Dashboard</Text>
                <Text style={styles.directorSubtitle}>Welcome, {user?.name} • {user?.department}</Text>
              </View>

              <Animated.View
                style={[
                  styles.directorStatsContainer,
                  { transform: [{ scale: statsScaleAnim }] },
                ]}
              >
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

              <View ref={pendingAnchorRef} style={styles.sectionAnchor} />

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

  // Staff view with fixed auto-scroll
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
          <View style={styles.header}>
            <Text style={styles.welcomeText}>Welcome, {user?.name}</Text>
            <Text style={styles.roleText}>{user?.department} • Faculty</Text>
          </View>

          <View style={styles.statsContainer}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => handleNavigateToSection('all-requests')}
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

          <View ref={pendingAnchorRef} style={styles.sectionAnchor} />

          <View style={styles.pendingRequestsContainer}>
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
  notificationHint: {
    color: '#3B82F6',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
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
    minHeight: 800,
    marginBottom: 32,
  },
  pendingRequestsContainer: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    padding: 0,
    marginBottom: 32,
    minHeight: 270,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  preRenderedSection: {
    flex: 1,
  },
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