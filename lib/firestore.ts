import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  getDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
  writeBatch,
  serverTimestamp,
  DocumentSnapshot
} from 'firebase/firestore';

import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from './firebase';
import { sendNotificationToDirectors, sendPushNotificationToUser } from './notificationTokenManager';

// Enhanced interface with better typing
export interface LeaveRequest {
  id: string;
  userId: string;
  empId: string;
  department: string;
  requestType: 'Leave' | 'Permission' | 'On Duty' | 'Compensation';
  leaveType: string;
  leaveSubType?: string;
  fromDate: Date;
  toDate?: Date;
  fromTime?: string;
  toTime?: string;
  reason: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  status: 'Pending' | 'Approved' | 'Rejected';
  remark?: string;
  createdAt: Date;
  updatedAt?: Date;
  approvedBy?: string;
  approvedAt?: Date;
  userName?: string;
  employeeId?: string;
  priority?: 'Low' | 'Medium' | 'High';
  isUrgent?: boolean;
}

// Enhanced leave request creation with high priority notifications
export const createLeaveRequest = async (
  requestData: Omit<LeaveRequest, 'id' | 'createdAt' | 'status'>
): Promise<string> => {
  try {
    console.log('Creating leave request with data:', requestData);

    const dataToSave = {
      ...requestData,
      fromDate: Timestamp.fromDate(requestData.fromDate),
      toDate: requestData.toDate ? Timestamp.fromDate(requestData.toDate) : null,
      status: 'Pending' as const,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      priority: requestData.priority || 'Medium',
      isUrgent: requestData.isUrgent || false,
    };

    const docRef = await addDoc(collection(db, 'leaveRequests'), dataToSave);
    console.log('Leave request created with ID:', docRef.id);

    // Send HIGH PRIORITY notifications asynchronously
    setImmediate(async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', requestData.userId));
        const userName = userDoc.exists() ? userDoc.data().name : 'Unknown User';
        const userDepartment = requestData.department;

        // Determine notification priority based on request
        const notificationPriority = requestData.isUrgent ? 'urgent' : 'high';

        // Send HIGH PRIORITY notification to all directors
        await sendNotificationToDirectors(
          requestData.isUrgent ? '🚨 URGENT: New Leave Request' : '📋 New Leave Request',
          `${userName} from ${userDepartment} submitted a new ${requestData.requestType.toLowerCase()} request${requestData.isUrgent ? ' (URGENT)' : ''}`
        );
      } catch (error) {
        console.error('Error sending notification:', error);
      }
    });

    return docRef.id;
  } catch (error) {
    console.error('Error creating leave request:', error);
    throw new Error(`Failed to create leave request: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Get leave requests with pagination
export const getLeaveRequests = async (
  userId?: string
): Promise<LeaveRequest[]> => {
  try {
    let querySnapshot;

    if (userId) {
      // For staff: get only their requests
      const q = query(
        collection(db, 'leaveRequests'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      querySnapshot = await getDocs(q);
    } else {
      // For directors: get all requests
      const q = query(
        collection(db, 'leaveRequests'),
        orderBy('createdAt', 'desc')
      );
      querySnapshot = await getDocs(q);
    }

    // Use Promise.all for concurrent user lookups
    const requestsPromises = querySnapshot.docs.map(async (docSnapshot) => {
      const data = docSnapshot.data();

      // Get user name concurrently
      try {
        const userDoc = await getDoc(doc(db, 'users', data.userId));
        const userName = userDoc.exists() ? userDoc.data().name : 'Unknown User';

        return {
          id: docSnapshot.id,
          ...data,
          fromDate: data.fromDate.toDate(),
          toDate: data.toDate ? data.toDate.toDate() : undefined,
          createdAt: data.createdAt.toDate(),
          updatedAt: data.updatedAt ? data.updatedAt.toDate() : undefined,
          approvedAt: data.approvedAt ? data.approvedAt.toDate() : undefined,
          userName,
        } as LeaveRequest;
      } catch (error) {
        console.error('Error fetching user for request:', data.userId, error);
        return {
          id: docSnapshot.id,
          ...data,
          fromDate: data.fromDate.toDate(),
          toDate: data.toDate ? data.toDate.toDate() : undefined,
          createdAt: data.createdAt.toDate(),
          updatedAt: data.updatedAt ? data.updatedAt.toDate() : undefined,
          approvedAt: data.approvedAt ? data.approvedAt.toDate() : undefined,
          userName: 'Unknown User',
        } as LeaveRequest;
      }
    });

    const requests = await Promise.all(requestsPromises);

    // Sort by createdAt descending
    requests.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return requests;
  } catch (error) {
    console.error('Error getting leave requests:', error);
    throw new Error(`Failed to get leave requests: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Enhanced status update with high priority notifications
export const updateLeaveRequestStatus = async (
  requestId: string,
  status: 'Approved' | 'Rejected',
  remark?: string,
  approvedBy?: string
): Promise<void> => {
  try {
    const updateData: any = {
      status,
      updatedAt: serverTimestamp(),
    };

    if (remark) {
      updateData.remark = remark;
    }

    if (approvedBy) {
      updateData.approvedBy = approvedBy;
      updateData.approvedAt = serverTimestamp();
    }

    await updateDoc(doc(db, 'leaveRequests', requestId), updateData);

    // Send HIGH PRIORITY notifications asynchronously
    setImmediate(async () => {
      try {
        const requestDoc = await getDoc(doc(db, 'leaveRequests', requestId));
        if (requestDoc.exists()) {
          const requestData = requestDoc.data();

          const userDoc = await getDoc(doc(db, 'users', requestData.userId));
          const userName = userDoc.exists() ? userDoc.data().name : 'Unknown User';

          // Determine notification priority
          const notificationPriority = requestData.isUrgent ? 'urgent' : 'high';

          const notificationTitle = status === 'Approved' ?
            (requestData.isUrgent ? '✅ URGENT Request Approved' : '✅ Request Approved') :
            (requestData.isUrgent ? '❌ URGENT Request Denied' : '❌ Request Denied');

          const notificationBody = status === 'Approved'
            ? `Your ${requestData.requestType.toLowerCase()} request has been approved`
            : `Your ${requestData.requestType.toLowerCase()} request has been denied${remark ? `. Reason: ${remark}` : ''}`;

          // Add notification type to data payload
          const notificationData = {
            type: status.toLowerCase() // 'approved' or 'rejected'
          };

          // Send HIGH PRIORITY notification to the user
          await sendPushNotificationToUser(
            requestData.userId,
            notificationTitle,
            notificationBody,
            notificationData  // Pass notification type
          );
        }
      } catch (error) {
        console.error('Error sending notification:', error);
      }
    });
  } catch (error) {
    console.error('Error updating leave request status:', error);
    throw new Error(`Failed to update leave request status: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export async function fetchMatchingLeaves(userId: string, leaveType: string, leaveSubType?: string) {
  const leavesRef = collection(db, "leaveRequests");

  // Basic query: userId, leaveType, and status = Approved
  let q = query(
    leavesRef,
    where("userId", "==", userId),
    where("leaveType", "==", leaveType),
    where("status", "==", "Approved")
  );

  // If it's Casual leave and leaveSubType is provided, add that filter too
  if (leaveType === "Casual" && leaveSubType) {
    q = query(
      leavesRef,
      where("userId", "==", userId),
      where("leaveType", "==", leaveType),
      where("leaveSubType", "==", leaveSubType),
      where("status", "==", "Approved")
    );
  }

  try {
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data()).length;
  } catch (error) {
    console.error("Error querying leaves:", error);
    throw error;
  }
}

export const deleteLeaveRequest = async (requestId: string): Promise<void> => {
  try {
    console.log('Deleting leave request with ID:', requestId);

    // Delete the document from Firestore
    await deleteDoc(doc(db, 'leaveRequests', requestId));

    console.log('Leave request deleted successfully');
  } catch (error) {
    console.error('Error deleting leave request:', error);
    throw new Error(`Failed to delete leave request: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Helper function to format date to YYYY-MM-DD
 */
const formatDateToYYYYMMDD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Get all working Saturdays from Firestore
 * @returns Array of date strings (YYYY-MM-DD format)
 */
export const getWorkingSaturdays = async (campus?: string): Promise<string[]> => {
  try {
    // Fetch all saturday configs and filter client-side for campus (including legacy docs without campus)
    const q = query(collection(db, 'saturdayLeave'));
    const querySnapshot = await getDocs(q);
    const all = querySnapshot.docs.map(d => d.data()) as any[];
    const filtered = all.filter(item => {
      if (campus) return (item.campus === campus) || (!item.campus);
      return !item.campus;
    }).filter(item => item.isHoliday === false);

    const workingSaturdays = filtered.map(item => item.date);

    console.log(`Found ${workingSaturdays.length} working Saturdays`);
    return workingSaturdays;
  } catch (error) {
    console.error('Error fetching working Saturdays:', error);
    return [];
  }
};

/**
 * Check if a specific Saturday is a working day
 * @param date - Date to check
 * @returns true if it's a working Saturday, false otherwise
 */
export const isSaturdayWorking = async (date: Date, campus?: string): Promise<boolean> => {
  try {
    // Check if it's actually a Saturday
    if (date.getDay() !== 6) {
      return false;
    }

    const dateStr = formatDateToYYYYMMDD(date);
    // Try campus-specific doc first
    if (campus) {
      const campusDocRef = doc(db, 'saturdayLeave', `${dateStr}_${campus}`);
      const campusSnap = await getDoc(campusDocRef);
      if (campusSnap.exists()) {
        const data = campusSnap.data();
        return data.isHoliday === false;
      }
    }

    // Fallback to legacy document without campus
    const docRef = doc(db, 'saturdayLeave', dateStr);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return data.isHoliday === false;
    }

    // Document doesn't exist = default: Saturday is working
    return true;
  } catch (error) {
    console.error('Error checking Saturday status:', error);
    return false;
  }
};

/**
 * Get working Saturdays within a date range
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Array of date strings (YYYY-MM-DD format)
 */
export const getWorkingSaturdaysInRange = async (
  startDate: Date,
  endDate: Date,
  campus?: string
): Promise<string[]> => {
  try {
    const startDateStr = formatDateToYYYYMMDD(startDate);
    const endDateStr = formatDateToYYYYMMDD(endDate);

    // Fetch all and filter client side for campus constraints
    const q = query(collection(db, 'saturdayLeave'));
    const querySnapshot = await getDocs(q);
    const all = querySnapshot.docs.map(d => d.data()) as any[];
    const filtered = all.filter(item => {
      if (campus) return (item.campus === campus) || (!item.campus);
      return !item.campus;
    }).filter(item => item.isHoliday === false && item.date >= startDateStr && item.date <= endDateStr);

    return filtered.map(item => item.date);
  } catch (error) {
    console.error('Error fetching working Saturdays in range:', error);
    return [];
  }
};

// Alias for backward compatibility
export const getSaturdayLeave = getWorkingSaturdays;

// Export constants
export const LEAVE_REQUEST_CONSTANTS = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_FILE_TYPES: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
  DEFAULT_LIMIT: 20,
  MIN_REASON_LENGTH: 10,
};

