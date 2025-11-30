import React, { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { getCurrentUser } from '@/lib/auth';
import HolidaysManager from '@/components/holidays/HolidaysManager';
import { useRouter } from 'expo-router';

export default function HolidaysPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const currentUser = await getCurrentUser();
        if (!currentUser || currentUser.role !== 'SubAdmin') {
          router.replace('/(tabs)/');
          return;
        }
        setUser(currentUser);
      } catch (error) {
        console.error('Error fetching user', error);
        router.replace('/(tabs)/');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Holidays Management</Text>
        <Text style={styles.subtitle}>Add / edit / delete public holidays and manage working Saturdays</Text>
      </View>
      <HolidaysManager />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#F9FAFB' },
  header: { marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#6B7280', marginTop: 4 },
});
