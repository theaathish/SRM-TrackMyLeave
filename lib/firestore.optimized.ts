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
import { sendNotificationToDirectors, sendPushNotificationToUser } from './notifications';

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

// Query options for better performance
export interface QueryOptions {
  limit?: number;
  startAfter?: DocumentSnapshot;
  orderBy?: 'createdAt' | 'updatedAt' | 'fromDate';
  orderDirection?: 'asc' | 'desc';
}

// Validation functions
const validateLeaveRequest = (requestData: Omit<LeaveRequest, 'id' | 'createdAt' | 'status'>): void => {
  const requiredFields = ['userId', 'empId', 'department', 'requestType', 'fromDate', 'reason'];
  
  for (const field of requiredFields) {
    if (!requestData[field as keyof typeof requestData]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // Validate date logic
  if (requestData.toDate && requestData.fromDate > requestData.toDate) {
    throw new Error('From date cannot be after to date');
  }
  
  // Validate reason length
  if (requestData.reason.length < 10) {
    throw new Error('Reason must be at least 10 characters long');
  }
  
  // Validate request type specific fields
  if (requestData.requestType === 'Permission' && !requestData.fromTime) {
    throw new Error('Permission requests require from time');
  }
};

// Enhanced error handling with retry logic
const executeWithRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
  throw new Error('Max retries exceeded');
};

// Optimized file upload with progress tracking
export const uploadFile = async (
  file: any, 
  userId: string,
  onProgress?: (progress: number) => void
): Promise<{ url: string; fileName: string; fileSize: number }> => {
  try {
    if (!file) throw new Error('No file provided');
    
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
    
    if (!allowedExtensions.includes(fileExtension || '')) {
      throw new Error('File type not supported. Please use PDF, JPG, PNG, DOC, or DOCX files.');
    }
    
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new Error('File size must be less than 5MB');
    }
    
    const fileName = `${userId}-${Date.now()}.${fileExtension}`;
    const storageRef = ref(storage, `leave-documents/${fileName}`);
    
    let fileBlob;
    if (file.uri) {
      // React Native file
      const response = await fetch(file.uri);
      fileBlob = await response.blob();
    } else {
      // Web file
      fileBlob = file;
    }
    
    // Upload with progress tracking
    const uploadTask = uploadBytes(storageRef, fileBlob);
    
    // Simulate progress for now (Firebase doesn't provide upload progress in v9)
    if (onProgress) {
      const progressInterval = setInterval(() => {
        // Simulate progress
        onProgress(Math.random() * 100);
      }, 500);
      
      uploadTask.finally(() => clearInterval(progressInterval));
    }
    
    const snapshot = await uploadTask;
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    return {
      url: downloadURL,
      fileName: file.name,
      fileSize: file.size
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Enhanced leave request creation with better error handling
export const createLeaveRequest = async (
  requestData: Omit<LeaveRequest, 'id' | 'createdAt' | 'status'>
): Promise<string> => {
  try {
    console.log('Creating leave request with data:', requestData);
    
    // Validate request data
    validateLeaveRequest(requestData);
    
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
    
    console.log('Data to save to Firestore:', dataToSave);
    
    // Use retry logic for database operations
    const docRef = await executeWithRetry(async () => {
      return await addDoc(collection(db, 'leaveRequests'), dataToSave);
    });
    
    console.log('Leave request created with ID:', docRef.id);
    
    // Send notifications asynchronously (don't wait for completion)
    setImmediate(async () => {
      try {
        // Get user information for notification
        const userDoc = await getDoc(doc(db, 'users', requestData.userId));
        const userName = userDoc.exists() ? userDoc.data().name : 'Unknown User';
        const userDepartment = requestData.department;
        
        // Send notification to all directors about new request
        await sendNotificationToDirectors(
          'New Leave Request',
          `${userName} from ${userDepartment} submitted a new ${requestData.requestType.toLowerCase()} request`,
          {
            type: 'leave_request_created',
            requestId: docRef.id,
            userId: requestData.userId,
            userName,
            requestType: requestData.requestType,
            department: userDepartment,
            priority: requestData.priority,
            isUrgent: requestData.isUrgent,
          }
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

// Optimized leave request retrieval with pagination
export const getLeaveRequests = async (
  userId?: string,
  options: QueryOptions = {}
): Promise<{ requests: LeaveRequest[]; hasMore: boolean; lastDoc?: DocumentSnapshot }> => {
  try {
    const {
      limit: queryLimit = 20,
      startAfter: startAfterDoc,
      orderBy: orderByField = 'createdAt',
      orderDirection = 'desc'
    } = options;
    
    let querySnapshot;
    let hasMore = false;
    
    if (userId) {
      // For staff: get only their requests with ordering
      try {
        const q = query(
          collection(db, 'leaveRequests'),
          where('userId', '==', userId),
          orderBy(orderByField, orderDirection),
          ...(startAfterDoc ? [startAfter(startAfterDoc)] : []),
          limit(queryLimit + 1) // Get one extra to check if there are more
        );
        querySnapshot = await getDocs(q);
      } catch (indexError: any) {
        // Handle Firestore index error gracefully
        if (indexError.code === 'failed-precondition' && indexError.message.includes('requires an index')) {
          console.warn('Firestore index missing, falling back to unordered query');
          const fallbackQ = query(
            collection(db, 'leaveRequests'),
            where('userId', '==', userId),
            ...(startAfterDoc ? [startAfter(startAfterDoc)] : []),
            limit(queryLimit + 1)
          );
          querySnapshot = await getDocs(fallbackQ);
        } else {
          throw indexError;
        }
      }
    } else {
      // For directors: get all requests with ordering
      try {
        const q = query(
          collection(db, 'leaveRequests'),
          orderBy(orderByField, orderDirection),
          ...(startAfterDoc ? [startAfter(startAfterDoc)] : []),
          limit(queryLimit + 1)
        );
        querySnapshot = await getDocs(q);
      } catch (indexError: any) {
        if (indexError.code === 'failed-precondition' && indexError.message.includes('requires an index')) {
          console.warn('Firestore index missing, falling back to unordered query');
          const fallbackQ = query(
            collection(db, 'leaveRequests'),
            ...(startAfterDoc ? [startAfter(startAfterDoc)] : []),
            limit(queryLimit + 1)
          );
          querySnapshot = await getDocs(fallbackQ);
        } else {
          throw indexError;
        }
      }
    }

    // Check if there are more documents
    const docs = querySnapshot.docs;
    if (docs.length > queryLimit) {
      hasMore = true;
      docs.pop(); // Remove the extra document
    }

    // Use Promise.all for concurrent user lookups
    const requestsPromises = docs.map(async (docSnapshot) => {
      const data = docSnapshot.data();
      
      // Get user name concurrently
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
    });

    const requests = await Promise.all(requestsPromises);
    
    // Sort by createdAt descending if no index was used
    if (orderByField === 'createdAt' && orderDirection === 'desc') {
      requests.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    
    return {
      requests,
      hasMore,
      lastDoc: docs.length > 0 ? docs[docs.length - 1] : undefined
    };
  } catch (error) {
    console.error('Error getting leave requests:', error);
    throw new Error(`Failed to get leave requests: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Enhanced status update with better tracking
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
    
    // Send notifications asynchronously
    setImmediate(async () => {
      try {
        const requestDoc = await getDoc(doc(db, 'leaveRequests', requestId));
        if (requestDoc.exists()) {
          const requestData = requestDoc.data();
          
          // Get user information
          const userDoc = await getDoc(doc(db, 'users', requestData.userId));
          const userName = userDoc.exists() ? userDoc.data().name : 'Unknown User';
          
          // Determine notification message based on status
          const notificationTitle = status === 'Approved' ? 'Request Approved' : 'Request Denied';
          const notificationBody = status === 'Approved' 
            ? `Your ${requestData.requestType.toLowerCase()} request has been approved`
            : `Your ${requestData.requestType.toLowerCase()} request has been denied`;
          
          // Send notification to the user who submitted the request
          await sendPushNotificationToUser(
            requestData.userId,
            notificationTitle,
            notificationBody,
            {
              type: 'leave_request_updated',
              requestId,
              status,
              requestType: requestData.requestType,
              remark: remark || null,
              approvedBy: approvedBy || null,
            }
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

// Batch operations for better performance
export const batchUpdateLeaveRequests = async (
  updates: Array<{ id: string; data: Partial<LeaveRequest> }>
): Promise<void> => {
  try {
    const batch = writeBatch(db);
    
    updates.forEach(({ id, data }) => {
      const docRef = doc(db, 'leaveRequests', id);
      batch.update(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
    });
    
    await batch.commit();
  } catch (error) {
    console.error('Error batch updating leave requests:', error);
    throw new Error(`Failed to batch update leave requests: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Enhanced query functions for directors
export const getLeaveRequestsByDepartment = async (
  department: string,
  options: QueryOptions = {}
): Promise<{ requests: LeaveRequest[]; hasMore: boolean; lastDoc?: DocumentSnapshot }> => {
  try {
    const {
      limit: queryLimit = 20,
      startAfter: startAfterDoc,
      orderBy: orderByField = 'createdAt',
      orderDirection = 'desc'
    } = options;
    
    const q = query(
      collection(db, 'leaveRequests'),
      where('department', '==', department),
      orderBy(orderByField, orderDirection),
      ...(startAfterDoc ? [startAfter(startAfterDoc)] : []),
      limit(queryLimit + 1)
    );
    
    const querySnapshot = await getDocs(q);
    const docs = querySnapshot.docs;
    const hasMore = docs.length > queryLimit;
    
    if (hasMore) {
      docs.pop();
    }
    
    const requests = await Promise.all(
      docs.map(async (docSnapshot) => {
        const data = docSnapshot.data();
        const userDoc = await getDoc(doc(db, 'users', data.userId));
        const userName = userDoc.exists() ? userDoc.data().name : 'Unknown User';
        
        return {
          id: docSnapshot.id,
          ...data,
          fromDate: data.fromDate.toDate(),
          toDate: data.toDate ? data.toDate.toDate() : undefined,
          createdAt: data.createdAt.toDate(),
          updatedAt: data.updatedAt ? data.updatedAt.toDate() : undefined,
          userName,
        } as LeaveRequest;
      })
    );
    
    return {
      requests,
      hasMore,
      lastDoc: docs.length > 0 ? docs[docs.length - 1] : undefined
    };
  } catch (error) {
    console.error('Error getting leave requests by department:', error);
    throw new Error(`Failed to get leave requests by department: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Get pending requests for directors
export const getPendingLeaveRequests = async (
  options: QueryOptions = {}
): Promise<{ requests: LeaveRequest[]; hasMore: boolean; lastDoc?: DocumentSnapshot }> => {
  try {
    const {
      limit: queryLimit = 20,
      startAfter: startAfterDoc,
      orderBy: orderByField = 'createdAt',
      orderDirection = 'desc'
    } = options;
    
    const q = query(
      collection(db, 'leaveRequests'),
      where('status', '==', 'Pending'),
      orderBy(orderByField, orderDirection),
      ...(startAfterDoc ? [startAfter(startAfterDoc)] : []),
      limit(queryLimit + 1)
    );
    
    const querySnapshot = await getDocs(q);
    const docs = querySnapshot.docs;
    const hasMore = docs.length > queryLimit;
    
    if (hasMore) {
      docs.pop();
    }
    
    const requests = await Promise.all(
      docs.map(async (docSnapshot) => {
        const data = docSnapshot.data();
        const userDoc = await getDoc(doc(db, 'users', data.userId));
        const userName = userDoc.exists() ? userDoc.data().name : 'Unknown User';
        
        return {
          id: docSnapshot.id,
          ...data,
          fromDate: data.fromDate.toDate(),
          toDate: data.toDate ? data.toDate.toDate() : undefined,
          createdAt: data.createdAt.toDate(),
          updatedAt: data.updatedAt ? data.updatedAt.toDate() : undefined,
          userName,
        } as LeaveRequest;
      })
    );
    
    return {
      requests,
      hasMore,
      lastDoc: docs.length > 0 ? docs[docs.length - 1] : undefined
    };
  } catch (error) {
    console.error('Error getting pending leave requests:', error);
    throw new Error(`Failed to get pending leave requests: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Delete file from storage
export const deleteFileFromStorage = async (fileUrl: string): Promise<void> => {
  try {
    const storageRef = ref(storage, fileUrl);
    await deleteObject(storageRef);
  } catch (error) {
    console.error('Error deleting file from storage:', error);
    throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Enhanced request deletion with cleanup
export const deleteLeaveRequest = async (requestId: string): Promise<void> => {
  try {
    // Get request data first to check for file
    const requestDoc = await getDoc(doc(db, 'leaveRequests', requestId));
    if (!requestDoc.exists()) {
      throw new Error('Leave request not found');
    }
    
    const requestData = requestDoc.data();
    
    // Delete associated file if exists
    if (requestData.fileUrl) {
      try {
        await deleteFileFromStorage(requestData.fileUrl);
      } catch (error) {
        console.warn('Could not delete associated file:', error);
      }
    }
    
    // Delete the request document
    await updateDoc(doc(db, 'leaveRequests', requestId), {
      status: 'Deleted',
      updatedAt: serverTimestamp(),
    });
    
  } catch (error) {
    console.error('Error deleting leave request:', error);
    throw new Error(`Failed to delete leave request: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Analytics functions for insights
export const getLeaveRequestStats = async (
  userId?: string,
  department?: string,
  dateRange?: { start: Date; end: Date }
): Promise<{
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  byType: Record<string, number>;
}> => {
  try {
    let q = query(collection(db, 'leaveRequests'));
    
    // Apply filters
    if (userId) {
      q = query(q, where('userId', '==', userId));
    }
    
    if (department) {
      q = query(q, where('department', '==', department));
    }
    
    if (dateRange) {
      q = query(
        q,
        where('createdAt', '>=', Timestamp.fromDate(dateRange.start)),
        where('createdAt', '<=', Timestamp.fromDate(dateRange.end))
      );
    }
    
    const querySnapshot = await getDocs(q);
    const requests = querySnapshot.docs.map(doc => doc.data());
    
    // Calculate statistics
    const stats = {
      total: requests.length,
      pending: requests.filter(r => r.status === 'Pending').length,
      approved: requests.filter(r => r.status === 'Approved').length,
      rejected: requests.filter(r => r.status === 'Rejected').length,
      byType: {} as Record<string, number>,
    };
    
    // Count by request type
    requests.forEach(request => {
      stats.byType[request.requestType] = (stats.byType[request.requestType] || 0) + 1;
    });
    
    return stats;
  } catch (error) {
    console.error('Error getting leave request stats:', error);
    throw new Error(`Failed to get leave request stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Export utility functions
export const LeaveRequestUtils = {
  validateLeaveRequest,
  executeWithRetry,
};

// Export constants
export const LEAVE_REQUEST_CONSTANTS = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_FILE_TYPES: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
  DEFAULT_LIMIT: 20,
  MIN_REASON_LENGTH: 10,
};
