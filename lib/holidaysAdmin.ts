import { collection, doc, setDoc, updateDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { clearHolidaysCache } from './holidays';
import { Holiday } from './holidays';

/**
 * Create a new holiday in Firestore
 */
export const createHoliday = async (holiday: Omit<Holiday, 'id'> & { id?: string }): Promise<string> => {
  try {
    const id = holiday.id || `${holiday.year}-${holiday.name.replace(/\s+/g, '-').toLowerCase()}`;
    await setDoc(doc(db, 'holidays', id), {
      date: holiday.date,
      name: holiday.name,
      type: holiday.type,
      isRecurring: holiday.isRecurring,
      year: holiday.year,
    });
    clearHolidaysCache();
    return id;
  } catch (error) {
    console.error('Error creating holiday:', error);
    throw error;
  }
};

export const updateHoliday = async (id: string, updates: Partial<Holiday>) => {
  try {
    await updateDoc(doc(db, 'holidays', id), {
      ...updates,
      // Keep date as Date object in Firestore caller should supply proper value
    } as any);
    clearHolidaysCache();
  } catch (error) {
    console.error('Error updating holiday:', error);
    throw error;
  }
};

export const deleteHoliday = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'holidays', id));
    clearHolidaysCache();
  } catch (error) {
    console.error('Error deleting holiday:', error);
    throw error;
  }
};

// Manage working Saturdays using `saturdayLeave` collection
export const setSaturdayWorking = async (dateStr: string, isWorking: boolean) => {
  try {
    await setDoc(doc(db, 'saturdayLeave', dateStr), {
      date: dateStr,
      isHoliday: !isWorking,
    });
  } catch (error) {
    console.error('Error setting Saturday working:', error);
    throw error;
  }
};

export const removeSaturdayConfig = async (dateStr: string) => {
  try {
    await deleteDoc(doc(db, 'saturdayLeave', dateStr));
  } catch (error) {
    console.error('Error removing Saturday config:', error);
    throw error;
  }
};

export const listAllHolidays = async () => {
  try {
    const q = query(collection(db, 'holidays'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Error listing holidays:', error);
    return [];
  }
};

export const listSaturdayLeaves = async () => {
  try {
    const q = query(collection(db, 'saturdayLeave'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Error listing saturdayLeave entries:', error);
    return [];
  }
};

export default { createHoliday, updateHoliday, deleteHoliday, setSaturdayWorking, removeSaturdayConfig };
