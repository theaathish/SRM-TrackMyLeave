import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar, AlertTriangle } from 'lucide-react-native';
import { isHoliday, isWeekend, isDateBlocked } from '@/lib/holidays';

interface DatePickerProps {
  label?: string;
  value: Date | null;
  onValueChange: (date: Date | null) => void;
  placeholder?: string;
  error?: string;
  containerStyle?: any;
  minimumDate?: Date;
  maximumDate?: Date;
  allowWeekends?: boolean;
  allowHolidays?: boolean;
  showHolidayWarning?: boolean;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  label,
  value,
  onValueChange,
  placeholder = 'Select date',
  error,
  containerStyle,
  minimumDate,
  maximumDate,
  allowWeekends = true,
  allowHolidays = true,
  showHolidayWarning = true,
}) => {
  const [show, setShow] = useState(false);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleChange = async (_event: any, selectedDate?: Date) => {
    setShow(false);
    if (selectedDate) {
      // Check if date is blocked
      const { isBlocked, reason, holiday } = await isDateBlocked(selectedDate);
      
      if (isBlocked && (!allowWeekends || !allowHolidays)) {
        if (!allowWeekends && isWeekend(selectedDate)) {
          Alert.alert('Weekend Not Allowed', 'Please select a weekday.');
          return;
        }
        
        if (!allowHolidays && holiday) {
          Alert.alert('Holiday Not Allowed', `${holiday.name} is not allowed for selection.`);
          return;
        }
      }
      
      onValueChange(selectedDate);
    }
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        onPress={() => setShow(true)}
        style={[
          styles.datePicker,
          error && styles.datePickerError,
        ]}
        activeOpacity={0.85}
      >
        <View style={styles.dateDisplay}>
          <Calendar size={20} color="#6B7280" />
          <Text style={[
            styles.dateText,
            !value && styles.placeholderText,
          ]}>
            {value ? formatDate(value) : placeholder}
          </Text>
        </View>
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>{error}</Text>}

      {show && (
        <DateTimePicker
          value={value || new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%' },
  label: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 8 },
  datePicker: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  datePickerError: { borderColor: '#EF4444' },
  dateDisplay: { flexDirection: 'row', alignItems: 'center' },
  dateText: { fontSize: 16, color: '#111827', marginLeft: 12 },
  placeholderText: { color: '#9CA3AF' },
  errorText: { color: '#EF4444', fontSize: 14, marginTop: 6, fontWeight: '500' },
});
