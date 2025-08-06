import { collection, doc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

export interface Holiday {
  id: string;
  date: Date;
  name: string;
  type: 'national' | 'state' | 'university' | 'public';
  isRecurring: boolean;
  year?: number;
}

// Tamil Nadu State Holidays for 2024-2025 (SRM Institute specific)
export const LOCAL_HOLIDAYS: Holiday[] = [
  { date: '01-01', name: "New Year's Day", type: 'public' },
  { date: '01-14', name: 'Pongal', type: 'public' },
  { date: '01-15', name: 'Thiruvalluvar Day', type: 'public' },
  { date: '01-16', name: 'Uzhavar Thunal', type: 'public' },
  { date: '01-26', name: 'Republic Day', type: 'public' },
  { date: '05-01', name: 'May Day', type: 'public' },
  { date: '08-15', name: 'Independence Day', type: 'public' },
  { date: '10-02', name: 'Gandhi Jayanti', type: 'public' },
  { date: '12-25', name: 'Christmas Day', type: 'public' },
];

// Convert string dates to actual Holiday objects for multiple years
const generateHolidaysForYear = (year: number): Holiday[] => {
  return LOCAL_HOLIDAYS.map((holiday, index) => {
    const [month, day] = holiday.date.split('-').map(Number);
    return {
      id: `${year}-${holiday.date}-${holiday.name.replace(/\s+/g, '-').toLowerCase()}`,
      date: new Date(year, month - 1, day), // month is 0-indexed
      name: holiday.name,
      type: holiday.type as 'national' | 'state' | 'university' | 'public',
      isRecurring: true,
      year,
    };
  });
};

// Generate holidays for current year and next year
const currentYear = new Date().getFullYear();
const defaultHolidays: Holiday[] = [
  ...generateHolidaysForYear(currentYear),
  ...generateHolidaysForYear(currentYear + 1),
  
  // Add SRM specific holidays
  {
    id: `${currentYear}-07-15-srm-foundation-day`,
    date: new Date(currentYear, 6, 15), // July 15
    name: 'SRM Foundation Day',
    type: 'university',
    isRecurring: true,
    year: currentYear,
  },
  {
    id: `${currentYear + 1}-07-15-srm-foundation-day`,
    date: new Date(currentYear + 1, 6, 15), // July 15
    name: 'SRM Foundation Day',
    type: 'university',
    isRecurring: true,
    year: currentYear + 1,
  },
];

// Cache for holidays
let holidaysCache: Holiday[] | null = null;
let lastFetch: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export const initializeHolidays = async (): Promise<void> => {
  try {
    // Check if holidays already exist in Firestore
    const holidaysQuery = query(collection(db, 'holidays'));
    const snapshot = await getDocs(holidaysQuery);
    
    if (snapshot.empty) {
      console.log('Initializing Tamil Nadu holidays in Firestore...');
      
      // Add default holidays to Firestore
      for (const holiday of defaultHolidays) {
        await setDoc(doc(db, 'holidays', holiday.id), {
          date: holiday.date,
          name: holiday.name,
          type: holiday.type,
          isRecurring: holiday.isRecurring,
          year: holiday.year,
        });
      }
      
      console.log('Tamil Nadu holidays initialized successfully!');
    }
  } catch (error) {
    console.error('Error initializing holidays:', error);
  }
};

export const getHolidays = async (year?: number): Promise<Holiday[]> => {
  try {
    // Check cache first
    const now = Date.now();
    if (holidaysCache && (now - lastFetch) < CACHE_DURATION) {
      return year ? holidaysCache.filter(h => h.date.getFullYear() === year) : holidaysCache;
    }
    
    // Fetch from Firestore
    let holidaysQuery = query(collection(db, 'holidays'));
    
    if (year) {
      const startOfYear = new Date(year, 0, 1);
      const endOfYear = new Date(year, 11, 31);
      holidaysQuery = query(
        collection(db, 'holidays'),
        where('date', '>=', startOfYear),
        where('date', '<=', endOfYear)
      );
    }
    
    const snapshot = await getDocs(holidaysQuery);
    const holidays: Holiday[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date.toDate(),
    })) as Holiday[];
    
    // Update cache
    if (!year) {
      holidaysCache = holidays;
      lastFetch = now;
    }
    
    return holidays;
  } catch (error) {
    console.error('Error fetching holidays:', error);
    // Return default holidays as fallback
    return year ? defaultHolidays.filter(h => h.date.getFullYear() === year) : defaultHolidays;
  }
};

export const isHoliday = async (date: Date): Promise<{ isHoliday: boolean; holiday?: Holiday }> => {
  try {
    const holidays = await getHolidays(date.getFullYear());
    const holiday = holidays.find(h => 
      h.date.getDate() === date.getDate() && 
      h.date.getMonth() === date.getMonth() &&
      h.date.getFullYear() === date.getFullYear()
    );
    
    return {
      isHoliday: !!holiday,
      holiday,
    };
  } catch (error) {
    console.error('Error checking if date is holiday:', error);
    return { isHoliday: false };
  }
};

export const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
};

export const isWorkingDay = async (date: Date): Promise<boolean> => {
  if (isWeekend(date)) return false;
  
  const { isHoliday: isHol } = await isHoliday(date);
  return !isHol;
};

export const getWorkingDaysBetween = async (fromDate: Date, toDate: Date): Promise<number> => {
  let workingDays = 0;
  const currentDate = new Date(fromDate);
  
  // Set to start of day to avoid time issues
  currentDate.setHours(0, 0, 0, 0);
  const endDate = new Date(toDate);
  endDate.setHours(0, 0, 0, 0);
  
  while (currentDate <= endDate) {
    if (await isWorkingDay(currentDate)) {
      workingDays++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return workingDays;
};

export const addWorkingDays = async (startDate: Date, workingDaysToAdd: number): Promise<Date> => {
  const resultDate = new Date(startDate);
  let addedDays = 0;
  
  while (addedDays < workingDaysToAdd) {
    resultDate.setDate(resultDate.getDate() + 1);
    if (await isWorkingDay(resultDate)) {
      addedDays++;
    }
  }
  
  return resultDate;
};

// Get upcoming holidays (next 30 days)
export const getUpcomingHolidays = async (daysAhead: number = 30): Promise<Holiday[]> => {
  try {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + daysAhead);
    
    const holidays = await getHolidays(today.getFullYear());
    const nextYearHolidays = today.getFullYear() !== futureDate.getFullYear() 
      ? await getHolidays(futureDate.getFullYear()) 
      : [];
    
    const allHolidays = [...holidays, ...nextYearHolidays];
    
    return allHolidays
      .filter(h => h.date >= today && h.date <= futureDate)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  } catch (error) {
    console.error('Error getting upcoming holidays:', error);
    return [];
  }
};

// Get holidays by type
export const getHolidaysByType = async (type: 'national' | 'state' | 'university' | 'public', year?: number): Promise<Holiday[]> => {
  try {
    const holidays = await getHolidays(year);
    return holidays.filter(h => h.type === type);
  } catch (error) {
    console.error('Error getting holidays by type:', error);
    return [];
  }
};

// Check if a date range contains any holidays
export const hasHolidaysInRange = async (fromDate: Date, toDate: Date): Promise<{ hasHolidays: boolean; holidays: Holiday[] }> => {
  try {
    const holidays = await getHolidays(fromDate.getFullYear());
    const nextYearHolidays = fromDate.getFullYear() !== toDate.getFullYear() 
      ? await getHolidays(toDate.getFullYear()) 
      : [];
    
    const allHolidays = [...holidays, ...nextYearHolidays];
    
    const holidaysInRange = allHolidays.filter(h => 
      h.date >= fromDate && h.date <= toDate
    );
    
    return {
      hasHolidays: holidaysInRange.length > 0,
      holidays: holidaysInRange,
    };
  } catch (error) {
    console.error('Error checking holidays in range:', error);
    return { hasHolidays: false, holidays: [] };
  }
};

// Clear cache when needed
export const clearHolidaysCache = (): void => {
  holidaysCache = null;
  lastFetch = 0;
};

// Export constants
export const HOLIDAY_TYPES = {
  NATIONAL: 'national' as const,
  STATE: 'state' as const,
  UNIVERSITY: 'university' as const,
  PUBLIC: 'public' as const,
};

// Check if a date should be blocked for leave requests
export const isDateBlocked = async (date: Date): Promise<{ 
  isBlocked: boolean; 
  reason?: string; 
  holiday?: Holiday 
}> => {
  try {
    // Check if it's a weekend
    if (isWeekend(date)) {
      return {
        isBlocked: true,
        reason: 'Weekend (Saturday/Sunday) - not allowed for leave requests'
      };
    }
    
    // Check if it's a holiday
    const { isHoliday: isHol, holiday } = await isHoliday(date);
    if (isHol) {
      return {
        isBlocked: true,
        reason: `Holiday (${holiday?.name}) - not allowed for leave requests`,
        holiday
      };
    }
    
    return { isBlocked: false };
  } catch (error) {
    console.error('Error checking if date is blocked:', error);
    return { isBlocked: false };
  }
};

// Get next available working day after a given date
export const getNextWorkingDay = async (startDate: Date): Promise<Date> => {
  let nextDate = new Date(startDate);
  nextDate.setDate(nextDate.getDate() + 1);
  
  while (!(await isWorkingDay(nextDate))) {
    nextDate.setDate(nextDate.getDate() + 1);
  }
  
  return nextDate;
};

// Get previous available working day before a given date
export const getPreviousWorkingDay = async (startDate: Date): Promise<Date> => {
  let prevDate = new Date(startDate);
  prevDate.setDate(prevDate.getDate() - 1);
  
  while (!(await isWorkingDay(prevDate))) {
    prevDate.setDate(prevDate.setDate() - 1);
  }
  
  return prevDate;
};

// Get all blocked dates in a range (for calendar components)
export const getBlockedDatesInRange = async (
  startDate: Date, 
  endDate: Date
): Promise<Date[]> => {
  const blockedDates: Date[] = [];
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const { isBlocked } = await isDateBlocked(currentDate);
    if (isBlocked) {
      blockedDates.push(new Date(currentDate));
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return blockedDates;
};
