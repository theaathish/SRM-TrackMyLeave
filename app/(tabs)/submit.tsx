import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Alert, KeyboardAvoidingView, Platform, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Picker } from '@/components/ui/Picker';
import { DatePicker } from '@/components/ui/DatePicker';
import { TimePicker } from '@/components/ui/TimePicker';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { getCurrentUser, updateUserEmployeeId } from '@/lib/auth';
import { createLeaveRequest } from '@/lib/firestore';
import { Send, Clock, Calendar, User } from 'lucide-react-native';
import { getWorkingDaysBetween, initializeHolidays } from '@/lib/holidays';

const leaveTypes = [
  { label: 'Leave', value: 'Leave' },
  { label: 'Permission', value: 'Permission' },
  { label: 'On Duty', value: 'On Duty' },
  { label: 'Compensation', value: 'Compensation' },
];

const leaveSubTypes = [
  { label: 'Casual Leave', value: 'Casual' },
  { label: 'Medical Leave', value: 'Medical' },
  { label: 'Emergency Leave', value: 'Emergency' },
];

const leaveDurationOptions = [
  { label: 'Single Day', value: 'single' },
  { label: 'Multiple Days', value: 'multiple' },
];

const departmentOptions = [
  { label: 'Human Resources', value: 'HR' },
  { label: 'Information Technology', value: 'IT' },
  { label: 'Finance', value: 'Finance' },
  { label: 'Marketing', value: 'Marketing' },
  { label: 'Operations', value: 'Operations' },
  { label: 'Sales', value: 'Sales' },
];

export default function SubmitLeaveScreen() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));
  const [formData, setFormData] = useState({
    empId: '',
    department: '',
    leaveType: 'Leave',
    leaveSubType: 'Casual', // Change default to Casual
    leaveDuration: 'single',
    fromDate: null as Date | null,
    toDate: null as Date | null,
    workedDate: null as Date | null, // For compensation leave
    leaveDate: null as Date | null,  // For compensation leave
    fromTime: '',
    toTime: '',
    reason: '',
    calculatedDuration: '',
  });

  useEffect(() => {
    loadUserData();
    // Initialize Tamil Nadu holidays on app load
    initializeHolidays();
    // Animate in the form
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
    ]).start();
  }, []);

  const loadUserData = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        setFormData(prev => ({
          ...prev,
          department: currentUser.department,
          empId: currentUser.employeeId || '' // Leave empty if no employee ID, let user enter it
        }));
      } else {
        router.replace('/auth');
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      router.replace('/auth');
    }
  };

  const calculateMaxToTime = useCallback((from: string) => {
    if (!from) return '';
    const [h, m] = from.split(':').map(Number);
    const total = h * 60 + m + 480; // 8 hours max
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    // Handle day overflow
    if (hours >= 24) {
      return '23:59';
    }
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }, []);

  const calculateDuration = useCallback(async () => {
    if (formData.leaveType === 'Compensation') {
      // Compensation is always single day
      return (formData.workedDate && formData.leaveDate) ? '1 day (compensation)' : '';
    } else if (formData.leaveType === 'Leave' || formData.leaveType === 'On Duty') {
      if (!formData.fromDate) return '';

      if (formData.toDate) {
        // Use working days calculation for Leave and On Duty
        try {
          const workingDays = await getWorkingDaysBetween(formData.fromDate, formData.toDate);
          const totalDays = Math.floor((formData.toDate.getTime() - formData.fromDate.getTime()) / (1000 * 3600 * 24)) + 1;

          if (workingDays === 0) {
            return 'No working days';
          } else if (workingDays === 1) {
            return `1 working day${totalDays > 1 ? ` (${totalDays} total days)` : ''}`;
          } else {
            return `${workingDays} working days${totalDays !== workingDays ? ` (${totalDays} total days)` : ''}`;
          }
        } catch (error) {
          console.error('Error calculating working days:', error);
          // Fallback to simple calculation
          const daysDiff = Math.floor((formData.toDate.getTime() - formData.fromDate.getTime()) / (1000 * 3600 * 24)) + 1;
          return daysDiff === 1 ? '1 day' : `${daysDiff} days`;
        }
      } else {
        return '1 day';
      }
    } else if (formData.leaveType === 'Permission') {
      if (!formData.fromDate) return '';
      if (formData.fromTime && formData.toTime) {
        // Validate time format
        const fromParts = formData.fromTime.split(':');
        const toParts = formData.toTime.split(':');
        if (fromParts.length !== 2 || toParts.length !== 2) return '';
        const [fromHour, fromMinute] = fromParts.map(Number);
        const [toHour, toMinute] = toParts.map(Number);
        if (
          isNaN(fromHour) || isNaN(fromMinute) ||
          isNaN(toHour) || isNaN(toMinute)
        ) return '';
        const fromMinutes = fromHour * 60 + fromMinute;
        const toMinutes = toHour * 60 + toMinute;
        const diffMinutes = toMinutes - fromMinutes;
        if (diffMinutes < 10) return '';
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
      return '';
    }
    return '';
  }, [formData]);

  // Update calculated duration whenever relevant fields change
  useEffect(() => {
    const updateDuration = async () => {
      const duration = await calculateDuration();
      if (duration !== formData.calculatedDuration) {
        setFormData(prev => ({ ...prev, calculatedDuration: duration }));
      }
    };

    updateDuration();
  }, [formData.leaveType, formData.leaveDuration, formData.fromDate, formData.toDate, formData.workedDate, formData.leaveDate, formData.fromTime, formData.toTime, calculateDuration]);

  const validateForm = useCallback(async () => {
    console.log('Validating form...');
    console.log('Current formData:', formData);
    console.log('Current user:', user);

    if (!user) {
      console.log('Validation failed: No user');
      Alert.alert('Error', 'User not found');
      return false;
    }

    if (user.role !== 'Staff') {
      console.log('Validation failed: User role is not Staff, role is:', user.role);
      Alert.alert('Error', 'Only staff members can submit requests');
      return false;
    }

    if (!formData.empId || !formData.empId.trim()) {
      console.log('Validation failed: Employee ID missing or empty, empId:', formData.empId);
      Alert.alert('Error', 'Please enter your Employee ID');
      return false;
    }

    if (!formData.department) {
      console.log('Validation failed: Department missing');
      Alert.alert('Error', 'Please select your department');
      return false;
    }

    if (!formData.leaveType) {
      console.log('Validation failed: Leave type missing');
      Alert.alert('Error', 'Please select leave type');
      return false;
    }

    if (formData.leaveType === 'Compensation') {
      if (!formData.workedDate) {
        console.log('Validation failed: Worked date missing');
        Alert.alert('Error', 'Please select worked date');
        return false;
      }
      if (!formData.leaveDate) {
        console.log('Validation failed: Leave date missing');
        Alert.alert('Error', 'Please select leave date');
        return false;
      }
    } else {
      if (!formData.fromDate) {
        console.log('Validation failed: From date missing');
        Alert.alert('Error', 'Please select date');
        return false;
      }
    }

    if (formData.leaveType === 'Leave' || formData.leaveType === 'On Duty') {
      // Validate date range if to date is selected
      if (formData.toDate && formData.fromDate && formData.fromDate > formData.toDate) {
        // Auto-correct: set toDate = fromDate if user selects negative range
        setFormData(prev => ({ ...prev, toDate: prev.fromDate }));
        Alert.alert('Error', 'To date cannot be before From date. Adjusted to match From date.');
        return false;
      }
    }

    if (formData.leaveType === 'Permission') {
      // Permission is single day only, validate times
      if (!formData.fromTime) {
        console.log('Validation failed: From time missing');
        Alert.alert('Error', 'Please select from time');
        return false;
      }
      if (!formData.toTime) {
        console.log('Validation failed: To time missing');
        Alert.alert('Error', 'Please select to time');
        return false;
      }

      // Validate time range (max 2 hours for Permission and between 8 AM - 4 PM)
      const [fromHour, fromMinute] = formData.fromTime.split(':').map(Number);
      const [toHour, toMinute] = formData.toTime.split(':').map(Number);
      const fromMinutes = fromHour * 60 + fromMinute;
      const toMinutes = toHour * 60 + toMinute;
      const diffMinutes = toMinutes - fromMinutes;

      // Check if times are within working hours (8 AM - 4 PM)
      if (fromMinutes < 8 * 60 || fromMinutes > 16 * 60) {
        console.log('Validation failed: From time outside working hours');
        Alert.alert('Error', 'From time must be between 8:00 AM and 4:00 PM');
        return false;
      }

      if (toMinutes < 8 * 60 || toMinutes > 16 * 60) {
        console.log('Validation failed: To time outside working hours');
        Alert.alert('Error', 'To time must be between 8:00 AM and 4:00 PM');
        return false;
      }

      if (diffMinutes < 10) {
        console.log('Validation failed: Permission duration less than 10 minutes');
        Alert.alert('Error', 'Permission duration must be at least 10 minutes');
        return false;
      }
      if (diffMinutes > 120) { // 2 hours max
        console.log('Validation failed: Permission duration exceeds 2 hours');
        Alert.alert('Error', 'Permission duration cannot exceed 2 hours');
        return false;
      }
    }

    if (!formData.reason.trim()) {
      console.log('Validation failed: Reason missing');
      Alert.alert('Error', 'Please enter reason');
      return false;
    }

    // Holiday Sandwich Validation (skip for Permission and Compensation)
    if (formData.leaveType !== 'Permission' && formData.leaveType !== 'Compensation') {
      try {
        console.log('Running holiday sandwich validation...');
        setValidating(true);
        const { validateLeaveRequest } = await import('@/lib/holidays');
        
        const fromDate = formData.fromDate!;
        const toDate = formData.toDate || formData.fromDate!;
        
        const validation = await validateLeaveRequest(fromDate, toDate, formData.leaveType);
        
        if (!validation.isValid) {
          console.log('Validation failed: Holiday sandwich detected');
          Alert.alert(
            'Leave Request Not Allowed',
            validation.errors.join('\n\n'),
            [{ text: 'OK', style: 'default' }]
          );
          return false;
        }
        
        // Show warnings but allow user to proceed
        if (validation.warnings.length > 0) {
          console.log('Validation warnings:', validation.warnings);
          return new Promise<boolean>((resolve) => {
            Alert.alert(
              'Leave Request Warning',
              validation.warnings.join('\n\n') + '\n\nDo you want to continue?',
              [
                { 
                  text: 'Cancel', 
                  style: 'cancel',
                  onPress: () => resolve(false)
                },
                { 
                  text: 'Continue', 
                  style: 'default',
                  onPress: () => resolve(true)
                }
              ]
            );
          });
        }
        
      } catch (error) {
        console.error('Error during holiday validation:', error);
        // Don't block submission if validation fails due to technical issues
        console.log('Holiday validation failed, allowing submission to proceed');
      } finally {
        setValidating(false);
      }
    }

    console.log('Form validation passed successfully!');
    return true;
  }, [formData, user]);

  const handleSubmit = useCallback(async () => {
    console.log('Submit button clicked');
    console.log('Form data:', formData);
    console.log('User:', user);

    const isValid = await validateForm();
    if (!isValid) {
      console.log('Form validation failed');
      return;
    }

    if (!user) {
      console.log('No user found');
      Alert.alert('Error', 'Please log in to submit request');
      return;
    }

    console.log('Starting submission process...');
    setLoading(true);

    try {
      // Update user's employee ID if it's different or missing
      if (formData.empId && formData.empId !== user.employeeId) {
        console.log('Updating user employee ID to:', formData.empId);
        await updateUserEmployeeId(user.id, formData.empId);
        // Update local user object
        setUser((prev: any) => ({ ...prev, employeeId: formData.empId }));
      }

      // Create request data
      const requestData: any = {
        userId: user.id,
        empId: user.employeeId,
        department: formData.department,
        requestType: formData.leaveType,
        leaveType: formData.leaveType,
        reason: formData.reason,
        duration: formData.calculatedDuration,
      };

      console.log(requestData);

      // Add conditional fields based on leave type
      if (formData.leaveType === 'Compensation') {
        // For compensation, use worked date and leave date
        requestData.fromDate = formData.leaveDate!; // The actual leave date
        requestData.toDate = formData.leaveDate!;   // Same as from date (single day)
        requestData.workedDate = formData.workedDate!; // Store the worked date separately

        // Format reason with worked date and leave date info
        const workedDateStr = formData.workedDate!.toLocaleDateString('en-GB');
        const leaveDateStr = formData.leaveDate!.toLocaleDateString('en-GB');
        requestData.reason = `Worked Date: ${workedDateStr}\nLeave Date: ${leaveDateStr}\n${formData.reason}`;
      } else if (formData.leaveType === 'Leave') {
        // Use selected to date or same date for single day
        requestData.fromDate = formData.fromDate!;
        requestData.toDate = formData.toDate || formData.fromDate;
        requestData.leaveSubType = formData.leaveSubType; // Add subtype for leave
      } else if (formData.leaveType === 'Permission') {
        // Permission is always single day
        requestData.fromDate = formData.fromDate!;
        requestData.toDate = formData.fromDate;
        requestData.fromTime = formData.fromTime;
        requestData.toTime = formData.toTime;
      } else if (formData.leaveType === 'On Duty') {
        // Use selected to date or same date for single day
        requestData.fromDate = formData.fromDate!;
        requestData.toDate = formData.toDate || formData.fromDate;
      }

      console.log('Request data to submit:', requestData);

      const result = await createLeaveRequest(requestData);
      console.log('Submission result:', result);

      // Show success immediately and navigate back
      setLoading(false);
      Alert.alert('Success', `${formData.leaveType} request submitted successfully`, [
        {
          text: 'OK',
          onPress: () => {
            router.back();
          },
        },
      ]);

      // Reset form after successful submission (in background)
      setFormData({
        empId: formData.empId, // Keep the current employee ID
        department: user.department,
        leaveType: 'Leave',
        leaveSubType: 'Casual', // Change default to Casual
        leaveDuration: 'single',
        fromDate: null,
        toDate: null,
        workedDate: null,
        leaveDate: null,
        fromTime: '',
        toTime: '',
        reason: '',
        calculatedDuration: '',
      });
    } catch (error: any) {
      console.error('Submission error:', error);
      Alert.alert('Error', error.message || 'Failed to submit request. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [validateForm, formData, user]);

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.header}>
              <View style={styles.headerIcon}>
                <User size={24} color="#3B82F6" />
              </View>
              <Text style={styles.title}>Submit Request</Text>
              <Text style={styles.subtitle}>
                Fill in the details for your {formData.leaveType.toLowerCase()} request
              </Text>
              
              {/* Holiday Sandwich Prevention Info */}
              {(formData.leaveType === 'Leave' || formData.leaveType === 'On Duty') && (
                <View style={styles.infoBox}>
                  <Text style={styles.infoTitle}>📋 Leave Policy Reminder</Text>
                  <Text style={styles.infoText}>
                    • Cannot take leave on both sides of a holiday{'\n'}
                    • Cannot create long weekends (Friday + Monday){'\n'}
                    • Compensation leave is exempt from these restrictions
                  </Text>
                </View>
              )}
            </View>

            <Card style={styles.card}>
              <CardHeader style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Request Details</Text>
              </CardHeader>
              <CardContent style={styles.form}>
                <Input
                  label="Name"
                  value={user.name}
                  editable={false}
                  placeholder="Employee Name"
                  containerStyle={styles.input}
                  style={styles.readOnlyInput}
                />

                <Input
                  label="Department"
                  value={formData.department}
                  placeholder="Department"
                  editable={false}
                  containerStyle={styles.input}
                  style={styles.readOnlyInput}
                />

                <Picker
                  label="Category"
                  options={leaveTypes}
                  value={formData.leaveType}
                  onValueChange={(value) => setFormData(prev => ({
                    ...prev,
                    leaveType: value,
                    // Reset fields when changing leave type
                    toDate: null,
                    fromTime: '',
                    toTime: '',
                    calculatedDuration: '',
                    leaveSubType: value === 'Leave' ? 'Casual' : '', // Reset to Casual as default
                  }))}
                  containerStyle={styles.input}
                />

                {/* Leave Sub-type for Leave only */}
                {formData.leaveType === 'Leave' && (
                  <Picker
                    label="Leave Type"
                    options={leaveSubTypes}
                    value={formData.leaveSubType}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, leaveSubType: value }))}
                    containerStyle={styles.input}
                  />
                )}

                {/* Compensation Leave Information Banner */}
                {formData.leaveType === 'Compensation'}

                {/* Compensation Leave - Two separate date pickers */}
                {formData.leaveType === 'Compensation' ? (
                  <>
                    <DatePicker
                      label="Compensation for"
                      value={formData.workedDate}
                      onValueChange={(date) => setFormData(prev => ({ ...prev, workedDate: date }))}
                      containerStyle={styles.input}
                      allowWeekends={true}
                      allowHolidays={true}
                      showHolidayWarning={false}
                      isCompensationLeave={true}
                      maximumDate={new Date()} // Can only select past dates for worked date
                    />
                    <DatePicker
                      label="Compensation on"
                      value={formData.leaveDate}
                      onValueChange={(date) => setFormData(prev => ({ ...prev, leaveDate: date }))}
                      containerStyle={styles.input}
                      allowWeekends={false} // Block weekends for leave date
                      allowHolidays={false} // Block holidays for leave date
                      showHolidayWarning={true} // Show warning for holidays/weekends
                      isCompensationLeave={false} // Treat as regular working day selection
                      minimumDate={new Date()} // Can only select future dates for leave date
                    />
                  </>
                ) : (
                  <DatePicker
                    label="From Date"
                    value={formData.fromDate}
                    onValueChange={(date) => {
                      setFormData(prev => {
                        // If toDate is before new fromDate, auto-correct toDate
                        if (prev.toDate && date && prev.toDate < date) {
                          return { ...prev, fromDate: date, toDate: date };
                        }
                        return { ...prev, fromDate: date };
                      });
                    }}
                    containerStyle={styles.input}
                    allowWeekends={false}
                    allowHolidays={false}
                    showHolidayWarning={true}
                    minimumDate={new Date()}
                  />
                )}

                {/* To Date for Leave and On Duty only - not Permission or Compensation */}
                {(formData.leaveType === 'Leave' || formData.leaveType === 'On Duty') && (
                  <DatePicker
                    label="To Date"
                    value={formData.toDate}
                    onValueChange={(date) => {
                      setFormData(prev => {
                        // Prevent selecting toDate before fromDate
                        if (prev.fromDate && date && date < prev.fromDate) {
                          return { ...prev, toDate: prev.fromDate };
                        }
                        return { ...prev, toDate: date };
                      });
                    }}
                    containerStyle={styles.input}
                    allowWeekends={false}
                    allowHolidays={false}
                    showHolidayWarning={true}
                    minimumDate={formData.fromDate || new Date()}
                  />
                )}

                {formData.leaveType === 'Permission' && (
                  <>
                    <TimePicker
                      label="From Time"
                      value={formData.fromTime}
                      onValueChange={(time) => {
                        // Validate if time is within working hours (8 AM to 4 PM)
                        const [h, m] = time.split(':').map(Number);
                        const timeInMinutes = h * 60 + m;
                        const workStartMinutes = 8 * 60; // 8:00 AM
                        const workEndMinutes = 16 * 60; // 4:00 PM

                        // Check if time is outside working hours
                        if (timeInMinutes < workStartMinutes || timeInMinutes >= workEndMinutes) {
                          Alert.alert(
                            'Invalid Time',
                            'Please select a time between 8:00 AM and 4:00 PM (working hours only).',
                            [{ text: 'OK' }]
                          );
                          return;
                        }

                        // Only allow 08:00–11:00 and 12:00–15:00 for permission requests
                        if (!(
                          (h >= 8 && h <= 11) ||
                          (h >= 12 && h <= 15)
                        )) {
                          Alert.alert(
                            'Invalid Permission Time',
                            'Permission can only be requested during:\n• Morning: 8:00 AM - 11:00 AM\n• Afternoon: 12:00 PM - 3:00 PM',
                            [{ text: 'OK' }]
                          );
                          return;
                        }

                        // Calculate toTime: +1hr, capped at 12:00 for forenoon, 16:00 for afternoon
                        let toHour = h + 1;
                        let toMinute = m;
                        if (h >= 8 && h <= 11) {
                          if (toHour > 12 || (toHour === 12 && toMinute > 0)) {
                            toHour = 12;
                            toMinute = 0;
                          }
                        } else if (h >= 12 && h <= 15) {
                          if (toHour > 16 || (toHour === 16 && toMinute > 0)) {
                            toHour = 16;
                            toMinute = 0;
                          }
                        }
                        const toTime = `${toHour.toString().padStart(2, '0')}:${toMinute.toString().padStart(2, '0')}`;
                        setFormData(prev => ({
                          ...prev,
                          fromTime: time,
                          toTime,
                        }));
                      }}
                      containerStyle={styles.input}
                      isPermission={true}
                    />

                    {/* Read-only To Time field */}
                    <View style={styles.input}>
                      <Text style={styles.label}>To Time</Text>
                      <View style={[styles.readOnlyTimeDisplay]}>
                        <Clock size={20} color="#6B7280" />
                        <Text style={styles.readOnlyTimeText}>
                          {formData.toTime ? (() => {
                            const [hour, minute] = formData.toTime.split(':');
                            const hourNum = parseInt(hour, 10);
                            const ampm = hourNum >= 12 ? 'PM' : 'AM';
                            const displayHour = hourNum % 12 || 12;
                            return `${displayHour}:${minute.padStart(2, '0')} ${ampm}`;
                          })() : 'Auto-calculated'}
                        </Text>
                      </View>
                    </View>

                    {/* Permission Duration Display */}
                    {formData.calculatedDuration && (
                      <View style={styles.permissionDurationContainer}>
                        <Text style={styles.permissionDurationLabel}>Permission Duration</Text>
                        <View style={styles.permissionDurationDisplay}>
                          <Calendar size={20} color="#3B82F6" />
                          <Text style={styles.permissionDurationText}>
                            {formData.calculatedDuration}
                          </Text>
                        </View>
                      </View>
                    )}
                  </>
                )}

                {/* Enhanced Duration Display with working days info */}
                {formData.calculatedDuration && formData.leaveType !== 'Permission' && (
                  <View style={styles.durationContainer}>
                    <Text style={styles.durationLabel}>Duration</Text>
                    <View style={styles.durationDisplay}>
                      <Calendar size={20} color="#3B82F6" />
                      <Text style={styles.durationText}>
                        {formData.calculatedDuration}
                      </Text>
                    </View>
                    {formData.calculatedDuration.includes('working days') && (
                      <Text style={styles.durationNote}>
                        ℹ️ Weekends and holidays are excluded from working days count
                      </Text>
                    )}
                    {formData.leaveType === 'Compensation' && (
                      <Text style={styles.compensationNote}>
                        💡 Compensation leave for work done on non-working days
                      </Text>
                    )}
                  </View>
                )}

                <Input
                  label="Reason"
                  value={formData.reason}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, reason: text }))}
                  placeholder={
                    formData.leaveType === 'Compensation'
                      ? "Enter additional reason/details for compensation leave"
                      : "Enter reason for request"
                  }
                  multiline
                  numberOfLines={formData.leaveType === 'Compensation' ? 3 : 4}
                  containerStyle={styles.input}
                />

                {/* Show compensation dates summary */}
                {formData.leaveType === 'Compensation' && formData.workedDate && formData.leaveDate && (
                  <View style={styles.compensationSummary}>
                    <Text style={styles.compensationSummaryTitle}>Compensation Summary</Text>
                    <Text style={styles.compensationSummaryText}>
                      Worked Date: {formData.workedDate.toLocaleDateString('en-GB')}
                    </Text>
                    <Text style={styles.compensationSummaryText}>
                      Leave Date: {formData.leaveDate.toLocaleDateString('en-GB')}
                    </Text>
                  </View>
                )}

                {validating && (
                  <View style={styles.validationIndicator}>
                    <Text style={styles.validationText}>🔍 Checking for holiday conflicts...</Text>
                  </View>
                )}

                <Button
                  title={validating ? "Validating..." : "Submit Request"}
                  onPress={handleSubmit}
                  loading={loading || validating}
                  disabled={loading || validating}
                  icon={<Send size={20} color="white" />}
                  style={styles.submitButton}
                />
              </CardContent>
            </Card>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  content: {
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  headerIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  card: {
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  cardHeader: {
    paddingBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  form: {
    gap: 20,
  },
  input: {
    marginBottom: 0,
  },
  readOnlyInput: {
    backgroundColor: '#F3F4F6',
    color: '#6B7280',
  },
  submitButton: {
    marginTop: 12,
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: '#3B82F6',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  label: {
    fontSize: 14,
    color: '#111827',
    marginBottom: 4,
  },
  readOnlyText: {
    fontSize: 16,
    color: '#6B7280',
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    marginBottom: 8,
  },
  durationContainer: {
    marginBottom: 0,
  },
  durationLabel: {
    fontSize: 14,
    color: '#111827',
    marginBottom: 8,
    fontWeight: '600',
  },
  durationDisplay: {
    backgroundColor: '#EFF6FF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  durationText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '700',
    marginLeft: 8,
  },
  noteContainer: {
    backgroundColor: '#F0F9FF',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0EA5E9',
    marginBottom: 0,
  },
  noteText: {
    fontSize: 14,
    color: '#0369A1',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  permissionDurationContainer: {
    marginBottom: 0,
    marginTop: 8,
  },
  permissionDurationLabel: {
    fontSize: 14,
    color: '#111827',
    marginBottom: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  permissionDurationDisplay: {
    backgroundColor: '#ECFDF5',
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#3B82F6',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  permissionDurationText: {
    fontSize: 24,
    color: '#3B82F6',
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 8,
  },
  durationBreakdown: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 8,
  },
  timeRangeText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
    textAlign: 'center',
  },
  readOnlyTimeDisplay: {
    backgroundColor: '#F3F4F6',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  readOnlyTimeText: {
    fontSize: 16,
    color: '#6B7280',
    marginLeft: 12,
    fontWeight: '500',
  },
  helperText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 6,
    fontStyle: 'italic',
  },
  durationNote: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  compensationSummary: {
    backgroundColor: '#F0F9FF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0EA5E9',
    marginBottom: 0,
  },
  compensationSummaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0369A1',
    marginBottom: 8,
    textAlign: 'center',
  },
  compensationSummaryText: {
    fontSize: 14,
    color: '#0369A1',
    marginBottom: 4,
    textAlign: 'center',
  },
  validationIndicator: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  validationText: {
    fontSize: 14,
    color: '#92400E',
    textAlign: 'center',
    fontWeight: '500',
  },
  infoBox: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  infoTitle: {
    fontSize: 14,
    color: '#1E40AF',
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 18,
    textAlign: 'left',
  },
});