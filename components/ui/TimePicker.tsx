import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Clock } from 'lucide-react-native';

// Make sure you have installed the package:
// npx expo install @react-native-community/datetimepicker

interface TimePickerProps {
  label?: string;
  value: string;
  onValueChange: (time: string) => void;
  placeholder?: string;
  error?: string;
  containerStyle?: any;
  showDuration?: boolean;
  compareWithTime?: string;
  isPermission?: boolean; // Add this prop for permission restrictions
  excludeTimes?: string[]; // Array of time strings ("HH:mm") to disable
}

export const TimePicker: React.FC<TimePickerProps> = ({
  label,
  value,
  onValueChange,
  placeholder = 'Select time',
  error,
  containerStyle,
  showDuration = false,
  compareWithTime,
  isPermission = false,
  excludeTimes = [],
}) => {
  const [show, setShow] = useState(false);

  const formatTime = (time: string) => {
    if (!time) return '';
    const [hour, minute] = time.split(':');
    const hourNum = parseInt(hour, 10);
    const ampm = hourNum >= 12 ? 'PM' : 'AM';
    const displayHour = hourNum % 12 || 12;
    return `${displayHour}:${minute.padStart(2, '0')} ${ampm}`;
  };

  const calculateDuration = () => {
    if (!value || !compareWithTime || !showDuration) return '';
    try {
      const [fromHour, fromMinute] = compareWithTime.split(':').map(Number);
      const [toHour, toMinute] = value.split(':').map(Number);
      const fromMinutes = fromHour * 60 + fromMinute;
      const toMinutes = toHour * 60 + toMinute;
      const durationMinutes = toMinutes - fromMinutes;
      if (durationMinutes <= 0) return '';
      const hours = Math.floor(durationMinutes / 60);
      const minutes = durationMinutes % 60;
      if (hours > 0 && minutes > 0) {
        return `${hours}h ${minutes}m`;
      } else if (hours > 0) {
        return `${hours}h`;
      } else {
        return `${minutes} min`;
      }
    } catch (error) {
      return '';
    }
  };

  const getDateFromTime = (timeString: string) => {
    if (!timeString) return new Date();
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  const getMinMaxTime = () => {
    if (!isPermission) return { min: null, max: null };
    
    const minDate = new Date();
    minDate.setHours(8, 0, 0, 0); // 8 AM
    
    let maxDate = new Date();
    if (compareWithTime) {
      // For "to" time, limit to 2 hours from "from" time but not beyond 4 PM
      const [fromHour, fromMinute] = compareWithTime.split(':').map(Number);
      const fromMinutes = fromHour * 60 + fromMinute;
      const maxMinutes = Math.min(fromMinutes + 120, 16 * 60); // 2 hours max or 4 PM
      maxDate.setHours(Math.floor(maxMinutes / 60), maxMinutes % 60, 0, 0);
    } else {
      // For "from" time, limit to 4 PM
      maxDate.setHours(16, 0, 0, 0); // 4 PM
    }
    
    return { min: minDate, max: maxDate };
  };

  const handleChange = (_event: any, selectedDate?: Date) => {
    setShow(false);
    if (selectedDate) {
      if (isPermission) {
        const { min, max } = getMinMaxTime();
        if (min && selectedDate < min) {
          selectedDate = min;
        }
        if (max && selectedDate > max) {
          selectedDate = max;
        }
      }
      const hours = selectedDate.getHours().toString().padStart(2, '0');
      const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;
      // If this time is in excludeTimes, do nothing
      if (excludeTimes && excludeTimes.includes(timeStr)) {
        return;
      }
      onValueChange(timeStr);
    }
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={styles.labelContainer}>
        <Text style={styles.label}>{label}</Text>
        {showDuration && compareWithTime && value && (
          <Text style={styles.durationText}>Duration: {calculateDuration()}</Text>
        )}
      </View>
      <TouchableOpacity
        onPress={() => setShow(true)}
        style={[
          styles.timePicker,
          error && styles.timePickerError,
        ]}
        activeOpacity={0.85}
      >
        <View style={styles.timeDisplay}>
          <Clock size={20} color="#6B7280" />
          <Text style={[
            styles.timeText,
            !value && styles.placeholderText,
          ]}>
            {value ? formatTime(value) : placeholder}
          </Text>
        </View>
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>{error}</Text>}

      {show && (
        <DateTimePicker
          value={getDateFromTime(value)}
          mode="time"
          is24Hour={false}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
          minimumDate={isPermission ? getMinMaxTime().min || undefined : undefined}
          maximumDate={isPermission ? getMinMaxTime().max || undefined : undefined}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%' },
  labelContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: { fontSize: 15, fontWeight: '600', color: '#374151' },
  durationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timePicker: {
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
  timePickerError: { borderColor: '#EF4444' },
  timeDisplay: { flexDirection: 'row', alignItems: 'center' },
  timeText: { fontSize: 16, color: '#111827', marginLeft: 12 },
  placeholderText: { color: '#9CA3AF' },
  errorText: { color: '#EF4444', fontSize: 14, marginTop: 6, fontWeight: '500' },
});