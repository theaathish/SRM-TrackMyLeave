import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import ConfirmModal from '@/components/ui/ConfirmModal';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Picker } from '@/components/ui/Picker';
import { getCurrentUser, signOut, updateUserProfile, updateUserEmployeeId } from '@/lib/auth';
import { User, Mail, Building, Shield, LogOut, Edit, Save, X, Key } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { MaterialIcons } from '@expo/vector-icons';
import {
  checkBiometricCapability,
  getBiometricDescription
} from '@/lib/biometric';
import { appStateManager } from '@/lib/appStateManager';
import { auth } from '@/lib/firebase';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';

const departmentOptions = [
  { label: 'Automobile Engineering', value: 'BE_Automobile_Engineering' },
  { label: 'Bio Medical Engineering', value: 'BE_Bio_Medical_Engineering' },
  { label: 'Civil Engineering', value: 'BE_Civil_Engineering' },
  { label: 'Computer Science and Design', value: 'BE_Computer_Science_and_Design' },
  { label: 'Computer Science and Engineering', value: 'BE_Computer_Science_and_Engineering' },
  { label: 'Computer Science and Engineering (AI and ML)', value: 'BE_Computer_Science_and_Engineering_AI_ML' },
  { label: 'Computer Science and Engineering (Cyber Security)', value: 'BE_Computer_Science_and_Engineering_Cyber_Security' },
  { label: 'Electrical and Electronics Engineering', value: 'BE_Electrical_and_Electronics_Engineering' },
  { label: 'Electronics and Communication Engineering', value: 'BE_Electronics_and_Communication_Engineering' },
  { label: 'Electronics and Instrumentation Engineering', value: 'BE_Electronics_and_Instrumentation_Engineering' },
  { label: 'Mechanical Engineering', value: 'BE_Mechanical_Engineering' },
  { label: 'Robotics and Automation Engineering', value: 'BE_Robotics_and_Automation_Engineering' },
  { label: 'Artificial Intelligence and Data Science', value: 'BTech_Artificial_Intelligence_and_Data_Science' },
  { label: 'Biotechnology', value: 'BTech_Biotechnology' },
  { label: 'Computer Science and Business System (TCS partnership)', value: 'BTech_Computer_Science_and_Business_System_TCS' },
  { label: 'Information Technology', value: 'BTech_Information_Technology' },
  { label: 'Chemistry', value: 'Chemistry' },
  { label: 'English', value: 'English' },
  { label: 'Library', value: 'Library' },
  { label: 'M.B.A', value: 'MBA' },
  { label: 'M.C.A', value: 'MCA' },
  { label: 'Communication Systems', value: 'ME_Communication_Systems' },
  { label: 'Computer Science and Engineering', value: 'ME_Computer_Science_and_Engineering' },
  { label: 'Embedded System Technologies', value: 'ME_Embedded_System_Technologies' },
  { label: 'Engineering Design', value: 'ME_Engineering_Design' },
  { label: 'Structural Engineering', value: 'ME_Structural_Engineering' },
  { label: 'Maths', value: 'Maths' },
  { label: 'Ph.D. Programs', value: 'PhD_Programs' },
  { label: 'Physical Education', value: 'Physical_Education' },
  { label: 'Physics', value: 'Physics' },
  { label: 'Tamil', value: 'Tamil' },
  { label: 'SCIENCE & HUMANITIES', value: 'Science_and_Humanities' },
  { label: 'Research', value: 'Research' },
].sort((a, b) => a.label.localeCompare(b.label));

const roleOptions = [
  { label: 'Faculty', value: 'Staff' },
];

export default function ProfileScreen() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [editData, setEditData] = useState({
    name: '',
    email: '',
    department: '',
    role: '',
    employeeId: '',
  });
  const [biometricInfo, setBiometricInfo] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordFields, setPasswordFields] = useState({
    current: '',
    new: '',
    confirm: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [empIdEditable, setEmpIdEditable] = useState(false);

  useEffect(() => {
    loadUserData();
    loadBiometricInfo();
  }, []);

  const loadUserData = async () => {
    try {
      const currentUser = await getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        setEditData({
          name: currentUser.name || '',
          email: currentUser.email || '',
          department: currentUser.department || '',
          role: currentUser.role || 'Staff',
          employeeId: currentUser.employeeId || '',
        });
        setEmpIdEditable(!currentUser.employeeId);
      } else {
        router.replace('/auth/');
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      router.replace('/auth/');
    } finally {
      setLoading(false);
    }
  };

  const loadBiometricInfo = async () => {
    try {
      const description = await getBiometricDescription();
      setBiometricInfo(description);
    } catch (error) {
      console.error('Error loading biometric info:', error);
      setBiometricInfo('Unable to check biometric status');
    }
  };

  const handleSignOut = async () => {
    console.log('handleSignOut called');
    try {
      if (Platform.OS !== 'web') {
        setShowSignOutModal(true);
        return;
      }

      const confirmed = window.confirm('Are you sure you want to sign out?');
      if (confirmed) {
        console.log('Sign Out confirmed (web)');
        await performSignOut();
      }
    } catch (error) {
      console.error('Error in handleSignOut:', error);
      Alert.alert('Error', 'Failed to initiate sign out');
    }
  };

  const performSignOut = async () => {
    try {
      console.log('Performing sign out...');
      
      // Stop background listeners first
      if (Platform.OS !== 'web') {
        try {
          const { stopBackgroundNotificationListener } = await import('@/lib/notifications');
          stopBackgroundNotificationListener();
        } catch (error) {
          console.warn('Could not stop background listeners:', error);
        }
      }
      
      // Clean up app state manager
      appStateManager.cleanup();

      // Sign out from Firebase
      await signOut();
      console.log('Firebase sign out completed');

      // Clear secure storage (only on mobile)
      if (Platform.OS !== 'web') {
        try {
          await SecureStore.deleteItemAsync('app_pin');
          await SecureStore.deleteItemAsync('app_was_locked');
        } catch (error) {
          console.warn('Could not clear secure storage:', error);
        }
      }

      console.log('Navigating to auth screen...');
      
      // FIX: Use correct route path
      router.replace('/auth/');

    } catch (error) {
      console.error('Error in performSignOut:', error);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    }
  };

  const handleConfirmSignOut = async () => {
    console.log('Confirm sign out pressed');
    setShowSignOutModal(false);
    await performSignOut();
  };

  const handleCancelSignOut = () => {
    setShowSignOutModal(false);
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    if (!editData.name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    if (!editData.department && user.role === 'Staff') {
      Alert.alert('Error', 'Department is required for Faculty role');
      return;
    }

    if (empIdEditable && !editData.employeeId.trim()) {
      Alert.alert('Error', 'Employee ID is required');
      return;
    }

    setSaving(true);
    try {
      const updates = {
        name: editData.name.trim(),
        ...(user.role === 'Staff' && { department: editData.department }),
        ...(user.role === 'Director' && {
          email: editData.email.trim(),
          employeeId: editData.employeeId.trim(),
          department: editData.department,
        }),
      };

      if (empIdEditable && editData.employeeId.trim()) {
        await updateUserEmployeeId(user.id, editData.employeeId.trim());
        updates.employeeId = editData.employeeId.trim();
        setEmpIdEditable(false);
      }

      await updateUserProfile(user.id, updates);
      setUser((prev: any) => ({ ...prev, ...updates }));
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditData({
      name: user.name || '',
      email: user.email || '',
      department: user.department || '',
      role: user.role || 'Staff',
      employeeId: user.employeeId || '',
    });
    setIsEditing(false);
  };

  const handleOpenPasswordModal = () => {
    setPasswordFields({ current: '', new: '', confirm: '' });
    setShowPasswordModal(true);
  };

  const handleClosePasswordModal = () => {
    setShowPasswordModal(false);
    setPasswordFields({ current: '', new: '', confirm: '' });
  };

  const handleChangePassword = async () => {
    if (!passwordFields.current || !passwordFields.new || !passwordFields.confirm) {
      Alert.alert('Error', 'Please fill all password fields');
      return;
    }

    if (passwordFields.new.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters');
      return;
    }

    if (passwordFields.new !== passwordFields.confirm) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }

    setPasswordLoading(true);
    try {
      const userObj = auth.currentUser;
      if (!userObj || !userObj.email) throw new Error('User not found');

      const credential = EmailAuthProvider.credential(userObj.email, passwordFields.current);
      await reauthenticateWithCredential(userObj, credential);
      await updatePassword(userObj, passwordFields.new);

      Alert.alert('Success', 'Password changed successfully');
      setShowPasswordModal(false);
      setPasswordFields({ current: '', new: '', confirm: '' });
    } catch (error: any) {
      let message = 'Failed to change password';
      switch (error.code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
          message = 'Current password is incorrect';
          break;
        case 'auth/weak-password':
          message = 'New password is too weak. Please choose a stronger password.';
          break;
        case 'auth/too-many-requests':
          message = 'Too many attempts. Please try again later.';
          break;
        default:
          if (error.message) message = error.message;
          break;
      }
      Alert.alert('Error', message);
    } finally {
      setPasswordLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.loadingText}>User not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Profile</Text>
            <Text style={styles.subtitle}>Manage your account information</Text>
          </View>

          <Card style={styles.infoCard}>
            <CardHeader>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>Personal Information</Text>
                {!isEditing && (
                  <Button
                    onPress={() => setIsEditing(true)}
                    icon={<Edit size={16} color="#FFFFFF" />}
                    style={styles.editButton}
                  />
                )}
              </View>
            </CardHeader>
            <CardContent style={styles.infoContent}>
              <View style={styles.infoRow}>
                <User size={20} color="#6B7280" />
                <View style={styles.infoText}>
                  <Text style={styles.infoLabel}>Name</Text>
                  {isEditing ? (
                    <Input
                      value={editData.name}
                      onChangeText={(text) => setEditData(prev => ({ ...prev, name: text }))}
                      placeholder="Enter your name"
                      style={styles.input}
                    />
                  ) : (
                    <Text style={styles.infoValue}>{user.name}</Text>
                  )}
                </View>
              </View>

              <View style={styles.infoRow}>
                <Mail size={20} color="#6B7280" />
                <View style={styles.infoText}>
                  <Text style={styles.infoLabel}>Email</Text>
                  {isEditing && user.role === 'Director' ? (
                    <Input
                      value={editData.email}
                      onChangeText={(text) => setEditData(prev => ({ ...prev, email: text }))}
                      placeholder="Enter email"
                      style={styles.input}
                    />
                  ) : (
                    <View style={styles.lockedFieldContainer}>
                      <Text style={styles.infoValue}>{user.email}</Text>
                      {isEditing && user.role !== 'Director' && (
                        <Text style={styles.lockedText}>Locked</Text>
                      )}
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.infoRow}>
                <Building size={20} color="#6B7280" />
                <View style={styles.infoText}>
                  <Text style={styles.infoLabel}>Employee ID</Text>
                  {isEditing && empIdEditable ? (
                    <Input
                      value={editData.employeeId}
                      onChangeText={(text) => setEditData(prev => ({ ...prev, employeeId: text }))}
                      placeholder="Enter employee ID"
                      style={styles.input}
                    />
                  ) : (
                    <View style={styles.lockedFieldContainer}>
                      <Text style={styles.infoValue}>{user.employeeId}</Text>
                      <Text style={styles.lockedText}>Locked</Text>
                    </View>
                  )}
                </View>
              </View>

              {user.role !== 'Director' && (
                <View style={styles.infoRow}>
                  <Building size={20} color="#6B7280" />
                  <View style={styles.infoText}>
                    <Text style={styles.infoLabel}>Department</Text>
                    {isEditing ? (
                      <Picker
                        selectedValue={editData.department}
                        onValueChange={(value) => setEditData(prev => ({ ...prev, department: value }))}
                        options={departmentOptions}
                      />
                    ) : (
                      <Text style={styles.infoValue}>{user.department}</Text>
                    )}
                  </View>
                </View>
              )}

              <View style={styles.infoRow}>
                <Shield size={20} color="#6B7280" />
                <View style={styles.infoText}>
                  <Text style={styles.infoLabel}>Role</Text>
                  {isEditing && user.role === 'Director' ? (
                    <View style={styles.lockedFieldContainer}>
                      <Text style={styles.infoValue}>{user.role}</Text>
                      <Text style={styles.lockedText}>System Role</Text>
                    </View>
                  ) : isEditing && user.role === 'Staff' ? (
                    <View style={styles.lockedFieldContainer}>
                      <Text style={styles.infoValue}>Faculty</Text>
                      <Text style={styles.lockedText}>Locked</Text>
                    </View>
                  ) : (
                    <Text style={styles.infoValue}>{user.role === 'Staff' ? 'Faculty' : user.role}</Text>
                  )}
                </View>
              </View>
            </CardContent>
          </Card>

          <Card style={styles.infoCard}>
            <CardHeader>
              <Text style={styles.cardTitle}>Security & Authentication</Text>
            </CardHeader>
            <CardContent>
              <View style={styles.securityRow}>
                <MaterialIcons name="fingerprint" size={24} color="#6B7280" />
                <View style={styles.securityInfo}>
                  <Text style={styles.securityLabel}>Biometric Authentication</Text>
                  <Text style={styles.securityValue}>{biometricInfo}</Text>
                </View>
              </View>

              <View style={styles.securityRow}>
                <MaterialIcons name="lock-clock" size={24} color="#6B7280" />
                <View style={styles.securityInfo}>
                  <Text style={styles.securityLabel}>Auto-lock</Text>
                  <Text style={styles.securityValue}>30 seconds of inactivity</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.manualLockButton}
                onPress={() =>
                  Alert.alert(
                    'Test Biometric Lock',
                    'This will immediately lock the app to test the biometric authentication screen.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Lock Now',
                        onPress: () => appStateManager.manualLock()
                      },
                    ]
                  )
                }
              >
                <MaterialIcons name="lock" size={20} color="#6B7280" />
                <Text style={styles.manualLockText}>Test Biometric Lock</Text>
              </TouchableOpacity>

              <Button
                onPress={handleOpenPasswordModal}
                icon={<Key size={16} color="#FFFFFF" />}
                style={styles.pinButton}
              >
                Change Password
              </Button>

              <View style={styles.securityNoteContainer}>
                <MaterialIcons name="info" size={16} color="#065F46" />
                <Text style={styles.securityNoteText}>
                  This app uses biometric authentication (fingerprint, face recognition) for enhanced security.
                  Make sure biometrics are enabled in your device settings.
                </Text>
              </View>
            </CardContent>
          </Card>

          {isEditing ? (
            <View style={styles.actionsContainer}>
              <Button
                onPress={handleCancelEdit}
                variant="outline"
                icon={<X size={16} color="#6B7280" />}
              >
                Cancel
              </Button>
              <Button
                onPress={handleSaveProfile}
                loading={saving}
                icon={<Save size={16} color="#FFFFFF" />}
              >
                Save Changes
              </Button>
            </View>
          ) : (
            <Button
              onPress={handleSignOut}
              variant="danger"
              icon={<LogOut size={16} color="#FFFFFF" />}
            >
              Sign Out
            </Button>
          )}
        </View>
      </ScrollView>

      <ConfirmModal
        visible={showSignOutModal}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmText="Sign Out"
        cancelText="Cancel"
        onConfirm={handleConfirmSignOut}
        onCancel={handleCancelSignOut}
      />

      <ConfirmModal
        visible={showPasswordModal}
        title="Change Password"
        message="Enter your current password and new password"
        confirmText={passwordLoading ? "Changing..." : "Change Password"}
        cancelText="Cancel"
        onConfirm={handleChangePassword}
        onCancel={handleClosePasswordModal}
        disabled={passwordLoading}
      >
        <Input
          value={passwordFields.current}
          onChangeText={(text) => setPasswordFields(f => ({ ...f, current: text }))}
          secureTextEntry
          containerStyle={{ marginBottom: 12 }}
          placeholder="Enter your current password"
        />
        <Input
          value={passwordFields.new}
          onChangeText={(text) => setPasswordFields(f => ({ ...f, new: text }))}
          secureTextEntry
          containerStyle={{ marginBottom: 12 }}
          placeholder="Enter your new password"
        />
        <Input
          value={passwordFields.confirm}
          onChangeText={(text) => setPasswordFields(f => ({ ...f, confirm: text }))}
          secureTextEntry
          containerStyle={{ marginBottom: 0 }}
          placeholder="Re-enter your new password"
        />
        <Text style={styles.helperText}>Password must be at least 6 characters.</Text>
      </ConfirmModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#6B7280',
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  content: {
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  infoCard: {
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  infoContent: {
    gap: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    marginLeft: 12,
    flex: 1,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 8,
    fontSize: 16,
    color: '#111827',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pinButton: {
    marginBottom: 12,
  },
  lockedFieldContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lockedText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  securityInfo: {
    marginLeft: 12,
    flex: 1,
  },
  securityLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  securityValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  manualLockButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  manualLockText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
    fontWeight: '500',
  },
  securityNoteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    marginTop: 16,
  },
  securityNoteText: {
    fontSize: 14,
    color: '#065F46',
    marginLeft: 8,
    flex: 1,
  },
  helperText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 6,
    fontStyle: 'italic',
  },
});
