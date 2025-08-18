import React, { useEffect, useState } from 'react';
import { Tabs, useLocalSearchParams } from 'expo-router';
import { Home, Plus, User, Users } from 'lucide-react-native';
import { getCurrentUser } from '@/lib/auth';

export default function TabLayout() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Capture query parameters at the tab level
  const params = useLocalSearchParams();
  const notificationType = params.notificationType as string;

  useEffect(() => {
    loadUser();
  }, []);

  // Log parameters to debug
  useEffect(() => {
    if (notificationType) {
      console.log('Tab layout received notificationType:', notificationType);
    }
  }, [notificationType]);

  const loadUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#3B82F6',
        tabBarInactiveTintColor: '#6B7280',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'white',
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          paddingBottom: 8,
          paddingTop: 8,
          height: 80,
        },
      }}
      // Pass the notification type to all tab screens
      screenListeners={{
        tabPress: (e) => {
          if (notificationType) {
            console.log('Tab pressed with notification:', notificationType);
          }
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
        // You can pass the params as initial params if needed
        initialParams={{ notificationType }}
      />
      <Tabs.Screen
        name="submit"
        options={{
          title: 'Form',
          tabBarIcon: ({ color, size }) => <Plus size={size} color={color} />,
          href: user?.role === 'Staff' ? '/(tabs)/submit' : null,
        }}
      />
      <Tabs.Screen
        name="staff"
        options={{
          title: 'Faculty',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
          href: user?.role === 'Director' ? '/(tabs)/staff' : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}