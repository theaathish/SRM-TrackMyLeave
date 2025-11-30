import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, TouchableOpacity, Modal, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getHolidays, Holiday } from '@/lib/holidays';
import * as HolidaysAdmin from '@/lib/holidaysAdmin';

interface SaturdayLeave {
  id: string;
  date: string;
  isHoliday: boolean;
}

export default function HolidaysManager() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [newHoliday, setNewHoliday] = useState({
    name: '',
    date: new Date() as Date | null,
    type: 'public' as any,
    isRecurring: true
  });
  const [saturdays, setSaturdays] = useState<SaturdayLeave[]>([]);
  const [newSaturdayDate, setNewSaturdayDate] = useState<Date | null>(null);
  const [showHolidaysModal, setShowHolidaysModal] = useState(false);
  const [isLoadingModal, setIsLoadingModal] = useState(false);
  const [showHolidayDatePicker, setShowHolidayDatePicker] = useState(false);
  const [showSaturdayDatePicker, setShowSaturdayDatePicker] = useState(false);

  // Helper function to check if a date is Saturday
  const isSaturday = (date: Date): boolean => {
    return date.getDay() === 6;
  };

  // Helper function to get next Saturday from today
  const getNextSaturday = (): Date => {
    const today = new Date();
    const daysUntilSaturday = (6 - today.getDay() + 7) % 7;
    const nextSaturday = new Date(today);
    nextSaturday.setDate(today.getDate() + (daysUntilSaturday === 0 ? 7 : daysUntilSaturday));
    return nextSaturday;
  };

  // Memoize formatted holidays to prevent re-computation
  const formattedHolidays = useMemo(() => 
    holidays.map(item => ({
      ...item,
      formattedDate: new Date(item.date).toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    })), 
    [holidays]
  );

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadHolidays(), loadSaturdays()]);
    } catch (error) {
      console.error('Error loading initial data', error);
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadHolidays = async () => {
    try {
      const result = await getHolidays();
      setHolidays(result);
    } catch (error) {
      console.error('Unable to load holidays', error);
      throw error;
    }
  };

  const loadSaturdays = async () => {
    try {
      const list = await HolidaysAdmin.listSaturdayLeaves();
      setSaturdays(list);
    } catch (error) {
      console.error('Error loading Saturdays', error);
      throw error;
    }
  };

  const handleAddHoliday = async () => {
    if (!newHoliday.name.trim()) return Alert.alert('Validation Error', 'Holiday name is required');
    if (!newHoliday.date) return Alert.alert('Validation Error', 'Please select a date');
    
    try {
      await HolidaysAdmin.createHoliday({
        date: newHoliday.date,
        name: newHoliday.name,
        type: newHoliday.type,
        isRecurring: newHoliday.isRecurring,
        year: newHoliday.date.getFullYear(),
      });
      Alert.alert('Success', 'Holiday added successfully');
      setNewHoliday({ name: '', date: new Date(), type: 'public', isRecurring: true });
      await loadHolidays();
    } catch (error) {
      console.error('Error adding holiday', error);
      Alert.alert('Error', 'Failed to add holiday');
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this holiday?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await HolidaysAdmin.deleteHoliday(id);
              Alert.alert('Success', 'Holiday deleted');
              await loadHolidays();
            } catch (error) {
              console.error('Error deleting holiday', error);
              Alert.alert('Error', 'Failed to delete holiday');
            }
          },
        },
      ]
    );
  };

  const handleToggleSaturday = async (dateStr: string, isHoliday: boolean) => {
    try {
      if (isHoliday) {
        await HolidaysAdmin.removeSaturdayConfig(dateStr);
      } else {
        await HolidaysAdmin.setSaturdayWorking(dateStr, false);
      }
      await loadSaturdays();
    } catch (error) {
      console.error('Error toggling Saturday', error);
      Alert.alert('Error', 'Failed to update Saturday status');
    }
  };

  const handleAddSaturdayAsHoliday = async () => {
    try {
      if (!newSaturdayDate) return Alert.alert('Validation Error', 'Please select a Saturday');
      
      // Validate it's a Saturday
      if (!isSaturday(newSaturdayDate)) {
        return Alert.alert('Validation Error', 'Please select a Saturday. The selected date is not a Saturday.');
      }
      
      const dateStr = newSaturdayDate.toISOString().split('T')[0];
      await HolidaysAdmin.setSaturdayWorking(dateStr, false);
      Alert.alert('Success', 'Saturday marked as holiday');
      setNewSaturdayDate(null);
      await loadSaturdays();
    } catch (error) {
      console.error('Error adding saturday holiday', error);
      Alert.alert('Error', 'Failed to add saturday holiday');
    }
  };

  const handleOpenModal = () => {
    setIsLoadingModal(true);
    setTimeout(() => {
      setIsLoadingModal(false);
      setShowHolidaysModal(true);
    }, 300);
  };

  const onHolidayDateChange = (event: any, selectedDate?: Date) => {
    setShowHolidayDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setNewHoliday((s) => ({ ...s, date: selectedDate }));
    }
  };

  const onSaturdayDateChange = (event: any, selectedDate?: Date) => {
    setShowSaturdayDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setNewSaturdayDate(selectedDate);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading holidays...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.container}>
        {/* Add New Holiday Section */}
        <Card style={styles.card}>
          <CardHeader>
            <Text style={styles.sectionTitle}>Add New Holiday</Text>
            <Text style={styles.helperText}>Create a new public or company holiday</Text>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="Holiday name"
              value={newHoliday.name}
              onChangeText={(t) => setNewHoliday((s) => ({ ...s, name: t }))}
              containerStyle={styles.inputContainer}
            />
            
            <TouchableOpacity 
              style={styles.datePickerButton}
              onPress={() => setShowHolidayDatePicker(true)}
            >
              <Text style={styles.datePickerButtonText}>
                {newHoliday.date 
                  ? newHoliday.date.toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      year: 'numeric', 
                      month: 'short', 
                      day: 'numeric' 
                    })
                  : 'Select Date'}
              </Text>
            </TouchableOpacity>

            {showHolidayDatePicker && (
              <DateTimePicker
                value={newHoliday.date || new Date()}
                mode="date"
                display="default"
                onChange={onHolidayDateChange}
              />
            )}

            <Button title="Add Holiday" onPress={handleAddHoliday} style={styles.primaryButton} />
          </CardContent>
        </Card>

        {/* Clickable Public Holidays Summary Card */}
        <TouchableOpacity onPress={handleOpenModal}>
          <Card style={styles.card}>
            <CardContent>
              <View style={styles.summaryRow}>
                <View style={styles.summaryInfo}>
                  <Text style={styles.sectionTitle}>Public Holidays</Text>
                  <Text style={styles.helperText}>
                    {holidays.length} {holidays.length === 1 ? 'holiday' : 'holidays'} configured
                  </Text>
                </View>
                <View style={styles.viewButtonContainer}>
                  <Text style={styles.viewButtonText}>View All →</Text>
                </View>
              </View>
            </CardContent>
          </Card>
        </TouchableOpacity>

        {/* Saturday Configurations */}
        <Card style={styles.card}>
          <CardHeader>
            <Text style={styles.sectionTitle}>Saturday Configurations</Text>
            <Text style={styles.helperText}>Mark specific Saturdays as holidays or working days</Text>
          </CardHeader>
          <CardContent>
            <TouchableOpacity 
              style={styles.datePickerButton}
              onPress={() => setShowSaturdayDatePicker(true)}
            >
              <Text style={styles.datePickerButtonText}>
                {newSaturdayDate 
                  ? newSaturdayDate.toLocaleDateString('en-US', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })
                  : 'Select a Saturday'}
              </Text>
            </TouchableOpacity>

            {showSaturdayDatePicker && (
              <DateTimePicker
                value={newSaturdayDate || getNextSaturday()}
                mode="date"
                display="default"
                onChange={onSaturdayDateChange}
              />
            )}

            <Button 
              title="Mark as Holiday" 
              onPress={handleAddSaturdayAsHoliday} 
              style={styles.primaryButton} 
            />
          </CardContent>
        </Card>

        {/* Configured Saturdays List */}
        {saturdays.length > 0 && (
          <Card style={styles.card}>
            <CardHeader>
              <Text style={styles.subsectionTitle}>Configured Saturdays</Text>
              <Text style={styles.helperText}>
                {saturdays.length} {saturdays.length === 1 ? 'Saturday' : 'Saturdays'} configured
              </Text>
            </CardHeader>
            <CardContent>
              <View style={styles.saturdaysList}>
                {saturdays.map((item, index) => (
                  <View 
                    key={item.id} 
                    style={[
                      styles.saturdayItem,
                      index < saturdays.length - 1 && styles.itemBorder
                    ]}
                  >
                    <View style={styles.saturdayInfo}>
                      <Text style={styles.saturdayDate}>
                        {new Date(item.date).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </Text>
                      <View style={[styles.statusBadge, item.isHoliday ? styles.holidayBadge : styles.workingBadge]}>
                        <Text style={[styles.statusText, item.isHoliday ? styles.holidayText : styles.workingText]}>
                          {item.isHoliday ? '🎉 Holiday' : '💼 Working Day'}
                        </Text>
                      </View>
                    </View>
                    <Button
                      title={item.isHoliday ? 'Set Working' : 'Set Holiday'}
                      onPress={() => handleToggleSaturday(item.date, item.isHoliday)}
                      style={item.isHoliday ? styles.secondaryButton : styles.primaryButton}
                    />
                  </View>
                ))}
              </View>
            </CardContent>
          </Card>
        )}

        {saturdays.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📅</Text>
            <Text style={styles.emptyText}>No Saturday configurations yet</Text>
            <Text style={styles.emptySubtext}>Configure Saturdays above</Text>
          </View>
        )}

        {/* Loading Modal Overlay */}
        <Modal
          visible={isLoadingModal}
          transparent
          animationType="fade"
        >
          <View style={styles.loadingModalOverlay}>
            <View style={styles.loadingModalContent}>
              <ActivityIndicator size="large" color="#3B82F6" />
              <Text style={styles.loadingModalText}>Loading holidays...</Text>
            </View>
          </View>
        </Modal>

        {/* Main Holidays Modal */}
        <Modal
          visible={showHolidaysModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowHolidaysModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Public Holidays</Text>
                <TouchableOpacity onPress={() => setShowHolidaysModal(false)} style={styles.closeButton}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScrollView}>
                {holidays.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyIcon}>🎉</Text>
                    <Text style={styles.emptyText}>No holidays added yet</Text>
                    <Text style={styles.emptySubtext}>Add your first holiday above</Text>
                  </View>
                ) : (
                  <View style={styles.holidaysList}>
                    {formattedHolidays.map((item, index) => (
                      <View 
                        key={item.id} 
                        style={[
                          styles.holidayItem,
                          index < formattedHolidays.length - 1 && styles.itemBorder
                        ]}
                      >
                        <View style={styles.holidayInfo}>
                          <Text style={styles.holidayName}>{item.name}</Text>
                          <View style={styles.holidayMeta}>
                            <Text style={styles.holidayDate}>{item.formattedDate}</Text>
                            <View style={styles.typeBadge}>
                              <Text style={styles.typeText}>{item.type}</Text>
                            </View>
                          </View>
                        </View>
                        <Button 
                          title="Delete" 
                          onPress={() => handleDelete(item.id)} 
                          style={styles.deleteButton} 
                        />
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  container: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  card: {
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  helperText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 12,
  },
  datePickerButton: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  datePickerButtonText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  primaryButton: {
    marginTop: 12,
    backgroundColor: '#3B82F6',
  },
  secondaryButton: {
    backgroundColor: '#6B7280',
    minWidth: 100,
  },
  deleteButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 16,
    minWidth: 80,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryInfo: {
    flex: 1,
  },
  viewButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loadingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingModalContent: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  loadingModalText: {
    marginTop: 16,
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#6B7280',
  },
  modalScrollView: {
    padding: 20,
  },
  holidaysList: {
    gap: 0,
  },
  holidayItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  holidayInfo: {
    flex: 1,
    marginRight: 12,
  },
  holidayName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  holidayMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  holidayDate: {
    fontSize: 14,
    color: '#6B7280',
  },
  typeBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    textTransform: 'capitalize',
  },
  saturdaysList: {
    gap: 0,
  },
  saturdayItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  saturdayInfo: {
    flex: 1,
    marginRight: 12,
  },
  saturdayDate: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  holidayBadge: {
    backgroundColor: '#D1FAE5',
  },
  workingBadge: {
    backgroundColor: '#DBEAFE',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  holidayText: {
    color: '#059669',
  },
  workingText: {
    color: '#3B82F6',
  },
  emptyState: {
    paddingVertical: 32,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
