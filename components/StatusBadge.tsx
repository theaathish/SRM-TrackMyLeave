import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface StatusBadgeProps {
  status: 'Pending' | 'Approved' | 'Rejected';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getStatusStyles = () => {
    switch (status) {
      case 'Pending':
        return {
          container: styles.pendingContainer,
          text: styles.pendingText,
        };
      case 'Approved':
        return {
          container: styles.approvedContainer,
          text: styles.approvedText,
        };
      case 'Rejected':
        return {
          container: styles.rejectedContainer,
          text: styles.rejectedText,
        };
      default:
        return {
          container: styles.defaultContainer,
          text: styles.defaultText,
        };
    }
  };

  const getDisplayText = () => {
    return status === 'Rejected' ? 'Denied' : status;
  };

  const statusStyles = getStatusStyles();

  return (
    <View style={[styles.badge, statusStyles.container]}>
      <Text style={[styles.text, statusStyles.text]}>{getDisplayText()}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pendingContainer: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  pendingText: {
    color: '#92400E',
  },
  approvedContainer: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  approvedText: {
    color: '#065F46',
  },
  rejectedContainer: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  rejectedText: {
    color: '#991B1B',
  },
  defaultContainer: {
    backgroundColor: '#F3F4F6',
    borderColor: '#9CA3AF',
  },
  defaultText: {
    color: '#374151',
  },
});