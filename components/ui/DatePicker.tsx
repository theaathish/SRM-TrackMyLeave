import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar, AlertTriangle, Briefcase } from 'lucide-react-native';
import { isHoliday, isWeekend, isDateBlocked, isSaturday } from '@/lib/holidays';

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
  isCompensationLeave?: boolean;
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
  isCompensationLeave = false,
}) => {
  const [show, setShow] = useState(false);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleChange = async (event: any, selectedDate?: Date) => {
    setShow(false);

    if (!selectedDate || event?.type === 'dismissed') {
      return;
    }

    // Check if it's a Saturday and if it's a working Saturday
    const isSat = isSaturday(selectedDate);
    const { isHoliday: isHolidayDay, holiday, isSaturdayWorking } = await isHoliday(selectedDate);

    // Special handling for compensation leave
    if (isCompensationLeave) {
      const isWeekendDay = isWeekend(selectedDate);

      // For compensation leave, only allow weekends or holidays
      // BUT exclude working Saturdays (since they're normal work days)
      if (isSat && isSaturdayWorking) {
        Alert.alert(
          'Working Saturday',
          'This Saturday is a working day. Compensation leave can only be selected for non-working days (holidays or regular Saturdays).',
          [{ text: 'OK' }]
        );
        return;
      }

      if (!isWeekendDay && !isHolidayDay) {
        Alert.alert(
          'Invalid Date for Compensation Leave',
          'Compensation leave can only be selected for weekends or public holidays, as it compensates for work done on non-working days.',
          [{ text: 'OK' }]
        );
        return;
      }

      onValueChange(selectedDate);
      return;
    }

    // Normal date picker logic for other leave types
    const { isBlocked, reason, holiday: blockedHoliday } = await isDateBlocked(selectedDate);

    // If it's a working Saturday, show info but allow selection
    if (isSat && isSaturdayWorking) {
      Alert.alert(
        'Working Saturday',
        `${formatDate(selectedDate)} is a working Saturday. You can apply for leave on this day.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Continue',
            onPress: () => onValueChange(selectedDate),
          },
        ]
      );
      return;
    }

    // Block non-working Saturdays and Sundays if not allowed
    if (isBlocked && (!allowWeekends || !allowHolidays)) {
      if (!allowWeekends && isWeekend(selectedDate)) {
        Alert.alert('Weekend Not Allowed', 'Please select a weekday.');
        return;
      }

      if (!allowHolidays && blockedHoliday) {
        Alert.alert('Holiday Not Allowed', `${blockedHoliday.name} is not allowed for selection.`);
        return;
      }
    }

    // Show warning for holidays (if enabled)
    if (showHolidayWarning && isBlocked && blockedHoliday) {
      Alert.alert(
        'Holiday Selected',
        `${formatDate(selectedDate)} is ${blockedHoliday.name}. Do you want to select this date?`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Yes',
            onPress: () => onValueChange(selectedDate),
          },
        ]
      );
      return;
    }

    onValueChange(selectedDate);
  };

  const getPlaceholder = () => {
    if (isCompensationLeave) {
      return 'Select weekend or holiday';
    }
    return placeholder;
  };

  const getLabelStyle = () => {
    if (isCompensationLeave) {
      return [styles.label, styles.compensationLabel];
    }
    return styles.label;
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <View style={styles.labelContainer}>
          <Text style={getLabelStyle()}>{label}</Text>
          {isCompensationLeave && (
            <View style={styles.compensationNote}>
              <AlertTriangle size={14} color="#F59E0B" />
              <Text style={styles.compensationNoteText}>
                Weekends & holidays only
              </Text>
            </View>
          )}
        </View>
      )}
      <TouchableOpacity
        onPress={() => setShow(true)}
        style={[
          styles.datePicker,
          error && styles.datePickerError,
          isCompensationLeave && styles.compensationDatePicker,
        ]}
        activeOpacity={0.85}
      >
        <View style={styles.dateDisplay}>
          <Calendar size={20} color={isCompensationLeave ? "#F59E0B" : "#6B7280"} />
          <Text style={[
            styles.dateText,
            !value && styles.placeholderText,
            isCompensationLeave && styles.compensationDateText,
          ]}>
            {value ? formatDate(value) : getPlaceholder()}
          </Text>
        </View>
      </TouchableOpacity>
      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* Helper text for compensation leave */}
      {isCompensationLeave && (
        <Text style={styles.helperText}>
          💡 Select a weekend or public holiday (excludes working Saturdays)
        </Text>
      )}

      {/* Show working Saturday indicator */}
      {!isCompensationLeave && value && isSaturday(value) && (
        <WorkingSaturdayIndicator date={value} />
      )}

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

// New component to show working Saturday status
const WorkingSaturdayIndicator: React.FC<{ date: Date }> = ({ date }) => {
  const [isWorking, setIsWorking] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const checkStatus = async () => {
      const { isSaturdayWorking } = await isHoliday(date);
      setIsWorking(isSaturdayWorking || false);
    };
    checkStatus();
  }, [date]);

  if (isWorking === null) return null;

  if (isWorking) {
    return (
      <View style={styles.workingSaturdayBadge}>
        <Briefcase size={14} color="#059669" />
        <Text style={styles.workingSaturdayText}>Working Saturday - Leave can be applied</Text>
      </View>
    );
  }

  return (
    <View style={styles.holidaySaturdayBadge}>
      <Calendar size={14} color="#6B7280" />
      <Text style={styles.holidaySaturdayText}>Holiday Saturday</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%' },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  compensationLabel: {
    color: '#D97706',
  },
  compensationNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  compensationNoteText: {
    fontSize: 11,
    color: '#92400E',
    marginLeft: 4,
    fontWeight: '600',
  },
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
  compensationDatePicker: {
    borderColor: '#F59E0B',
    backgroundColor: '#FFFBEB',
  },
  datePickerError: { borderColor: '#EF4444' },
  dateDisplay: { flexDirection: 'row', alignItems: 'center' },
  dateText: {
    fontSize: 16,
    color: '#111827',
    marginLeft: 12,
  },
  compensationDateText: {
    color: '#92400E',
    fontWeight: '600',
  },
  placeholderText: { color: '#9CA3AF' },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    marginTop: 6,
    fontWeight: '500',
  },
  helperText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 8,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  workingSaturdayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
  },
  workingSaturdayText: {
    fontSize: 12,
    color: '#065F46',
    marginLeft: 6,
    fontWeight: '600',
  },
  holidaySaturdayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 8,
  },
  holidaySaturdayText: {
    fontSize: 12,
    color: '#4B5563',
    marginLeft: 6,
    fontWeight: '600',
  },
});

