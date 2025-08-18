import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDocs, 
  getDoc,
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
          
          // Send HIGH PRIORITY notification to the user
          await sendPushNotificationToUser(
            requestData.userId,
            notificationTitle,
            notificationBody
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

// Export constants
export const LEAVE_REQUEST_CONSTANTS = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_FILE_TYPES: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
  DEFAULT_LIMIT: 20,
  MIN_REASON_LENGTH: 10,
};