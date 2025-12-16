import { collection, doc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { isSaturdayWorking } from './firestore';

export interface Holiday {
  id: string;
  date: Date;
  name: string;
  type: 'national' | 'state' | 'university' | 'public';
  isRecurring: boolean;
  year?: number;
  campus?: string | null; // Optional: if specified, holiday applies only to that campus
}
interface LocalHolidayDef {
  date: string; // MM-DD
  name: string;
  type: 'national' | 'state' | 'university' | 'public';
}

// Tamil Nadu State Holidays for 2024-2025 (SRM Institute specific)
export const LOCAL_HOLIDAYS: LocalHolidayDef[] = [
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

/**
 * Check if a date is a Saturday
 */
export const isSaturday = (date: Date): boolean => {
  return date.getDay() === 6;
};

/**
 * Check if a date is a Sunday
 */
export const isSunday = (date: Date): boolean => {
  return date.getDay() === 0;
};

/**
 * Check if a date is a weekend (Saturday or Sunday)
 * NOTE: For working Saturdays, use isDateBlocked() which checks the DB
 */
export const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
};

/**
 * Check if a date is a holiday
 * UPDATED: Considers working Saturdays from Firestore
 */
export const isHoliday = async (date: Date, campus?: string): Promise<{ 
  isHoliday: boolean; 
  holiday?: Holiday;
  isSaturdayWorking?: boolean;
}> => {
  try {
    // Check if it's a working Saturday first
    if (isSaturday(date)) {
      const isWorking = await isSaturdayWorking(date, campus);
      
      if (isWorking) {
        // It's a working Saturday - NOT a holiday
        return { 
          isHoliday: false, 
          isSaturdayWorking: true 
        };
      } else {
        // It's a regular Saturday holiday
        return { 
          isHoliday: true, 
          holiday: {
            id: 'saturday',
            name: 'Saturday',
            date: date,
            type: 'public',
            isRecurring: true,
            campus: campus || null,
          },
          isSaturdayWorking: false
        };
      }
    }

    // Check Sundays
    if (isSunday(date)) {
      return { 
        isHoliday: true, 
        holiday: {
          id: 'sunday',
          name: 'Sunday',
          date: date,
          type: 'public',
          isRecurring: true,
          campus: campus || null,
        }
      };
    }

    // Check public/restricted holidays
    const holidays = await getHolidays(date.getFullYear());
    const holiday = holidays.find(h =>
      h.date.getDate() === date.getDate() &&
      h.date.getMonth() === date.getMonth() &&
      h.date.getFullYear() === date.getFullYear() &&
      (!h.campus || (campus && h.campus === campus))
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

/**
 * Check if a working day (not weekend, not holiday, OR a working Saturday)
 * UPDATED: Working Saturdays count as working days
 */
export const isWorkingDay = async (date: Date, campus?: string): Promise<boolean> => {
  // Check if it's a working Saturday
  if (isSaturday(date)) {
    return await isSaturdayWorking(date, campus);
  }

  // Sundays are never working days
  if (isSunday(date)) {
    return false;
  }

  // Check if it's a public holiday
  const { isHoliday: isHol } = await isHoliday(date, campus);
  return !isHol;
};

/**
 * Get working days between two dates
 * UPDATED: Includes working Saturdays in count
 */
export const getWorkingDaysBetween = async (fromDate: Date, toDate: Date, campus?: string): Promise<number> => {
  let workingDays = 0;
  const currentDate = new Date(fromDate);

  // Set to start of day to avoid time issues
  currentDate.setHours(0, 0, 0, 0);
  const endDate = new Date(toDate);
  endDate.setHours(0, 0, 0, 0);

  while (currentDate <= endDate) {
    if (await isWorkingDay(currentDate, campus)) {
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
export const hasHolidaysInRange = async (fromDate: Date, toDate: Date, campus?: string): Promise<{ hasHolidays: boolean; holidays: Holiday[] }> => {
  try {
    const holidays = await getHolidays(fromDate.getFullYear());
    const nextYearHolidays = fromDate.getFullYear() !== toDate.getFullYear()
      ? await getHolidays(toDate.getFullYear())
      : [];

    const allHolidays = [...holidays, ...nextYearHolidays];

    const holidaysInRange = allHolidays.filter(h =>
      h.date >= fromDate && h.date <= toDate && (!h.campus || (campus && h.campus === campus))
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

/**
 * Check if a date should be blocked for leave requests
 * UPDATED: Working Saturdays are NOT blocked
 */
export const isDateBlocked = async (date: Date, campus?: string): Promise<{
  isBlocked: boolean;
  reason?: string;
  holiday?: Holiday;
  isSaturdayWorking?: boolean;
}> => {
  try {
    // Check if it's a working Saturday first
    if (isSaturday(date)) {
      const isWorking = await isSaturdayWorking(date, campus);
      
      if (isWorking) {
        // Working Saturday - NOT blocked
        return { 
          isBlocked: false,
          isSaturdayWorking: true,
          reason: 'Working Saturday - leave can be applied'
        };
      } else {
        // Regular Saturday holiday - blocked
        return { 
          isBlocked: true,
          reason: 'Saturday (Holiday)',
          holiday: {
            id: 'saturday',
            name: 'Saturday',
            date: date,
            type: 'public',
            isRecurring: true,
            campus: campus || null,
          },
          isSaturdayWorking: false
        };
      }
    }

    // Check if it's Sunday
    if (isSunday(date)) {
      return {
        isBlocked: true,
        reason: 'Sunday',
        holiday: {
          id: 'sunday',
          name: 'Sunday',
          date: date,
          type: 'public',
          isRecurring: true,
          campus: campus || null,
        }
      };
    }

    // Check if it's a holiday
    const { isHoliday: isHol, holiday } = await isHoliday(date, campus);
    if (isHol) {
      return {
        isBlocked: true,
        reason: `Holiday (${holiday?.name})`,
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
    prevDate.setDate(prevDate.getDate() - 1);
  }

  return prevDate;
};

// Get all blocked dates in a range (for calendar components)
export const getBlockedDatesInRange = async (
  startDate: Date,
  endDate: Date,
  campus?: string
): Promise<Date[]> => {
  const blockedDates: Date[] = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const { isBlocked } = await isDateBlocked(currentDate, campus);
    if (isBlocked) {
      blockedDates.push(new Date(currentDate));
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return blockedDates;
};

// Enhanced validation for leave requests
export const validateLeaveRequest = async (
  fromDate: Date,
  toDate: Date,
  leaveType: string,
  campus?: string
): Promise<{
  isValid: boolean;
  errors: string[];
  warnings: string[];
}> => {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Skip validation for compensation leave (they can take leave on any day)
    if (leaveType === 'Compensation') {
      return { isValid: true, errors, warnings };
    }

    // Check for basic date validation
    if (fromDate > toDate) {
      errors.push('From date cannot be after to date');
    }

    // Check if dates are in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (fromDate < today) {
      errors.push('Cannot request leave for past dates');
    }

    // Check if any requested dates fall on existing holidays
    const { hasHolidays, holidays } = await hasHolidaysInRange(fromDate, toDate);
    if (hasHolidays && leaveType !== 'Compensation') {
      const holidayNames = holidays.filter(h => !h.campus || (campus && h.campus === campus)).map(h => `${h.name} (${h.date.toLocaleDateString('en-GB')})`);
      if (holidayNames.length > 0) {
        warnings.push(`Your leave request includes holidays: ${holidayNames.join(', ')}. Consider adjusting your dates.`);
      }
    }

    // Check for weekend days in the request (excluding working Saturdays)
    const currentDate = new Date(fromDate);
    const weekendDays: string[] = [];
    
    while (currentDate <= toDate) {
      if (isSunday(currentDate)) {
        weekendDays.push(currentDate.toLocaleDateString('en-GB'));
      } else if (isSaturday(currentDate)) {
        const isWorking = await isSaturdayWorking(currentDate, campus);
        if (!isWorking) {
          weekendDays.push(currentDate.toLocaleDateString('en-GB'));
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (weekendDays.length > 0 && leaveType !== 'Compensation') {
      warnings.push(`Your leave request includes non-working days: ${weekendDays.join(', ')}.`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  } catch (error) {
    console.error('Error validating leave request:', error);
    return {
      isValid: false,
      errors: ['Unable to validate leave request. Please try again.'],
      warnings
    };
  }
};

