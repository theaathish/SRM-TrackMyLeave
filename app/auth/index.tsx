import React, { useState, useEffect } from 'react';
import { View, Text, Alert, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Animated, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Picker } from '@/components/ui/Picker';
import { signIn, signUp, getCurrentUser } from '@/lib/auth';
import { Mail, Lock, User, LogIn, UserPlus, Building, Shield, GraduationCap } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

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

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    department: '',
    confirmPassword: '',
    employeeId: '',
  });

  useEffect(() => {
    checkAuthState();
    startAnimations();
  }, []);

  const startAnimations = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const checkAuthState = async () => {
    try {
      const user = await getCurrentUser();
      if (user) {
        console.log('User already authenticated, redirecting to main app');
        router.replace('/(tabs)/');
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
    }
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = () => {
    if (!formData.email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return false;
    }

    if (!(formData.email.includes("srmrmp.edu.in") || formData.email.includes("srmist.edu.in") || formData.email.includes("eec.srmrmp.edu.in") || formData.email.includes("trp.srmtrichy.edu.in"))){
      Alert.alert('Error', 'please use institutional mail');
      return false;
    }

    if (!validateEmail(formData.email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return false;
    }

    if (!formData.password.trim()) {
      Alert.alert('Error', 'Please enter your password');
      return false;
    }

    if (formData.password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return false;
    }

    if (!isLogin) {
      // Additional validation for signup
      if (!formData.name.trim()) {
        Alert.alert('Error', 'Please enter your full name');
        return false;
      }

      if (!formData.department) {
        Alert.alert('Error', 'Please select your department');
        return false;
      }

      if (!formData.employeeId.trim()) {
        Alert.alert('Error', 'Please enter your employee ID');
        return false;
      }

      if (!formData.confirmPassword.trim()) {
        Alert.alert('Error', 'Please confirm your password');
        return false;
      }

      if (formData.password !== formData.confirmPassword) {
        Alert.alert('Error', 'Passwords do not match');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      if (isLogin) {
        // Login flow
        const user = await signIn(formData.email.trim().toLowerCase(), formData.password);
        console.log('Login successful:', user);
        
        // Navigate to main app
        router.replace('/(tabs)/');
      } else {
        // Signup flow
        const user = await signUp(formData.email.trim().toLowerCase(), formData.password, formData.name.trim(), formData.department.trim(), formData.employeeId.trim());
        console.log('Signup successful:', user);
        
        Alert.alert(
          'Account Created! 🎉',
          'Your account has been created successfully. You can now sign in to access the leave management system.',
          [{ 
            text: 'Sign In Now', 
            onPress: () => {
              setIsLogin(true);
              setFormData(prev => ({
                ...prev,
                password: '',
                confirmPassword: '',
                name: '',
                department: '',
                employeeId: '',
              }));
            }
          }]
        );
      }
    } catch (error: any) {
      console.error('Authentication error:', error);
      
      let errorMessage = 'Authentication failed. Please try again.';
      
      // Handle specific Firebase errors
      if (error.message) {
        if (error.message.includes('user-not-found')) {
          errorMessage = 'No account found with this email address.';
        } else if (error.message.includes('wrong-password') || error.message.includes('invalid-credential')) {
          errorMessage = 'Incorrect email or password. Please try again.';
        } else if (error.message.includes('email-already-in-use')) {
          errorMessage = 'An account with this email already exists.';
        } else if (error.message.includes('weak-password')) {
          errorMessage = 'Password is too weak. Please choose a stronger password.';
        } else if (error.message.includes('invalid-email')) {
          errorMessage = 'Please enter a valid email address.';
        } else if (error.message.includes('too-many-requests')) {
          errorMessage = 'Too many attempts. Please try again later.';
        } else {
          errorMessage = error.message;
        }
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setFormData({
      email: '',
      password: '',
      name: '',
      department: '',
      confirmPassword: '',
      employeeId: '',
    });
  };

  return (
    <LinearGradient
      colors={['#3B82F6', '#1E40AF', '#1E3A8A']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
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
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.logoContainer}>
                  <GraduationCap size={48} color="#FFFFFF" />
                </View>
                <Text style={styles.appTitle}>TrackMyLeave</Text>
                <Text style={styles.appSubtitle}>SRM Institute Leave Management System</Text>
                <Text style={styles.appDescription}>
                  Streamlined leave management for faculty and administration
                </Text>
              </View>

              {/* Auth Card */}
              <Card style={styles.authCard}>
                <CardHeader>
                  <Text style={styles.cardTitle}>
                    {isLogin ? 'Welcome Back' : 'Create Your Account'}
                  </Text>
                  <Text style={styles.cardSubtitle}>
                    {isLogin 
                      ? 'Sign in to access your leave management dashboard' 
                      : 'Join the SRM Institute leave management system'
                    }
                  </Text>
                </CardHeader>

                <CardContent style={styles.form}>
                  {!isLogin && (
                    <>
                      <Input
                        label="Full Name"
                        value={formData.name}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
                        placeholder="Enter your full name"
                        icon={<User size={20} color="#6B7280" />}
                        containerStyle={styles.inputContainer}
                      />

                      <Input
                        label="Employee ID"
                        value={formData.employeeId}
                        onChangeText={(text) => setFormData(prev => ({ ...prev, employeeId: text }))}
                        placeholder="Enter your employee ID"
                        icon={<Shield size={20} color="#6B7280" />}
                        containerStyle={styles.inputContainer}
                      />

                      <Picker
                        label="Department"
                        options={departmentOptions}
                        value={formData.department}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, department: value }))}
                        containerStyle={styles.inputContainer}
                      />
                    </>
                  )}

                  <Input
                    label="Email Address"
                    value={formData.email}
                    onChangeText={(text) => setFormData(prev => ({ ...prev, email: text }))}
                    placeholder="Enter your institutional email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    icon={<Mail size={20} color="#6B7280" />}
                    containerStyle={styles.inputContainer}
                  />

                  <Input
                    label="Password"
                    value={formData.password}
                    onChangeText={(text) => setFormData(prev => ({ ...prev, password: text }))}
                    placeholder="Enter your password"
                    secureTextEntry
                    icon={<Lock size={20} color="#6B7280" />}
                    containerStyle={styles.inputContainer}
                  />

                  {!isLogin && (
                    <Input
                      label="Confirm Password"
                      value={formData.confirmPassword}
                      onChangeText={(text) => setFormData(prev => ({ ...prev, confirmPassword: text }))}
                      placeholder="Confirm your password"
                      secureTextEntry
                      icon={<Lock size={20} color="#6B7280" />}
                      containerStyle={styles.inputContainer}
                    />
                  )}

                  <Button
                    title={isLogin ? 'Sign In' : 'Create Account'}
                    onPress={handleSubmit}
                    loading={loading}
                    disabled={loading}
                    icon={isLogin ? <LogIn size={20} color="white" /> : <UserPlus size={20} color="white" />}
                    style={styles.submitButton}
                  />

                  <TouchableOpacity
                    onPress={toggleMode}
                    style={styles.toggleButton}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.toggleText}>
                      {isLogin 
                        ? "Don't have an account? " 
                        : "Already have an account? "
                      }
                      <Text style={styles.toggleLink}>
                        {isLogin ? 'Create Account' : 'Sign In'}
                      </Text>
                    </Text>
                  </TouchableOpacity>
                </CardContent>
              </Card>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  SRM Institute of Science and Technology
                </Text>
                <Text style={styles.footerSubtext}>
                  Secure • Reliable • Efficient Leave Management
                </Text>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  content: {
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  appSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 8,
  },
  appDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 20,
  },
  authCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
    marginBottom: 32,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  form: {
    gap: 20,
  },
  inputContainer: {
    marginBottom: 0,
  },
  submitButton: {
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  toggleButton: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  toggleText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  toggleLink: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
    marginBottom: 4,
    textAlign: 'center',
  },
  footerSubtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
});
