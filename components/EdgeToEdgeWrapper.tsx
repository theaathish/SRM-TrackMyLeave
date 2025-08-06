import React from 'react';
import { Platform, StatusBar, View } from 'react-native';

interface EdgeToEdgeWrapperProps {
  children: React.ReactNode;
}

export default function EdgeToEdgeWrapper({ children }: EdgeToEdgeWrapperProps) {
  if (Platform.OS === 'android') {
    return (
      <View style={{ flex: 1 }}>
        {/* Status bar background to fix the warning */}
        <View
          style={{
            height: StatusBar.currentHeight || 0,
            backgroundColor: '#F9FAFB', // Match your app background
          }}
        />
        {children}
      </View>
    );
  }

  return <>{children}</>;
}