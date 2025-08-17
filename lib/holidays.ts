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

// Check if a date range would create a "holiday sandwich" (continuous leave around holidays)
export const checkHolidaySandwich = async (
  fromDate: Date, 
  toDate: Date
): Promise<{
  isHolidaySandwich: boolean;
  reason?: string;
  blockedDates?: Date[];
}> => {
  try {
    // Get the date range including buffer days before and after
    const bufferDays = 2; // Check 2 days before and after
    const checkStartDate = new Date(fromDate);
    checkStartDate.setDate(checkStartDate.getDate() - bufferDays);
    
    const checkEndDate = new Date(toDate);
    checkEndDate.setDate(checkEndDate.getDate() + bufferDays);
    
    // Get all holidays in the extended range
    const { holidays } = await hasHolidaysInRange(checkStartDate, checkEndDate);
    
    if (holidays.length === 0) {
      return { isHolidaySandwich: false };
    }
    
    // Check for holiday sandwiching patterns
    const holidayDates = holidays.map(h => h.date);
    const requestedDates: Date[] = [];
    
    // Generate all requested leave dates
    const currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      requestedDates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Check each holiday for sandwiching
    for (const holidayDate of holidayDates) {
      const dayBefore = new Date(holidayDate);
      dayBefore.setDate(dayBefore.getDate() - 1);
      
      const dayAfter = new Date(holidayDate);
      dayAfter.setDate(dayAfter.getDate() + 1);
      
      // Check if user is requesting leave on the day before AND after a holiday
      const hasLeaveBefore = requestedDates.some(date => 
        date.toDateString() === dayBefore.toDateString()
      );
      
      const hasLeaveAfter = requestedDates.some(date => 
        date.toDateString() === dayAfter.toDateString()
      );
      
      if (hasLeaveBefore && hasLeaveAfter) {
        const holiday = holidays.find(h => 
          h.date.toDateString() === holidayDate.toDateString()
        );
        
        return {
          isHolidaySandwich: true,
          reason: `Cannot take leave on both ${dayBefore.toLocaleDateString('en-GB')} and ${dayAfter.toLocaleDateString('en-GB')} as it creates continuous leave around ${holiday?.name} (${holidayDate.toLocaleDateString('en-GB')})`,
          blockedDates: [dayBefore, dayAfter]
        };
      }
      
      // Check for extended patterns (multiple days before/after)
      const twoDaysBefore = new Date(holidayDate);
      twoDaysBefore.setDate(twoDaysBefore.getDate() - 2);
      
      const twoDaysAfter = new Date(holidayDate);
      twoDaysAfter.setDate(twoDaysAfter.getDate() + 2);
      
      // Check if creating a long continuous leave (3+ days including holiday)
      const hasExtendedLeaveBefore = requestedDates.some(date => 
        date.toDateString() === twoDaysBefore.toDateString() || 
        date.toDateString() === dayBefore.toDateString()
      );
      
      const hasExtendedLeaveAfter = requestedDates.some(date => 
        date.toDateString() === dayAfter.toDateString() || 
        date.toDateString() === twoDaysAfter.toDateString()
      );
      
      if (hasExtendedLeaveBefore && hasExtendedLeaveAfter) {
        const holiday = holidays.find(h => 
          h.date.toDateString() === holidayDate.toDateString()
        );
        
        return {
          isHolidaySandwich: true,
          reason: `Cannot create extended continuous leave around ${holiday?.name} (${holidayDate.toLocaleDateString('en-GB')}). This would result in excessive consecutive days off.`,
          blockedDates: [twoDaysBefore, dayBefore, dayAfter, twoDaysAfter]
        };
      }
    }
    
    // Check for weekend sandwiching as well
    for (const requestDate of requestedDates) {
      const dayOfWeek = requestDate.getDay();
      
      // If requesting leave on Friday, check if Monday is also requested (weekend sandwich)
      if (dayOfWeek === 5) { // Friday
        const nextMonday = new Date(requestDate);
        nextMonday.setDate(nextMonday.getDate() + 3); // Friday + 3 = Monday
        
        const hasMondayLeave = requestedDates.some(date => 
          date.toDateString() === nextMonday.toDateString()
        );
        
        if (hasMondayLeave) {
          return {
            isHolidaySandwich: true,
            reason: `Cannot take leave on both Friday (${requestDate.toLocaleDateString('en-GB')}) and Monday (${nextMonday.toLocaleDateString('en-GB')}) as it creates continuous leave around the weekend`,
            blockedDates: [requestDate, nextMonday]
          };
        }
      }
      
      // If requesting leave on Monday, check if previous Friday is also requested
      if (dayOfWeek === 1) { // Monday
        const prevFriday = new Date(requestDate);
        prevFriday.setDate(prevFriday.getDate() - 3); // Monday - 3 = Friday
        
        const hasFridayLeave = requestedDates.some(date => 
          date.toDateString() === prevFriday.toDateString()
        );
        
        if (hasFridayLeave) {
          return {
            isHolidaySandwich: true,
            reason: `Cannot take leave on both Friday (${prevFriday.toLocaleDateString('en-GB')}) and Monday (${requestDate.toLocaleDateString('en-GB')}) as it creates continuous leave around the weekend`,
            blockedDates: [prevFriday, requestDate]
          };
        }
      }
    }
    
    return { isHolidaySandwich: false };
    
  } catch (error) {
    console.error('Error checking holiday sandwich:', error);
    return { isHolidaySandwich: false };
  }
};

// Enhanced validation for leave requests
export const validateLeaveRequest = async (
  fromDate: Date,
  toDate: Date,
  leaveType: string
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
    
    // Check for holiday sandwiching
    const sandwichCheck = await checkHolidaySandwich(fromDate, toDate);
    if (sandwichCheck.isHolidaySandwich) {
      errors.push(sandwichCheck.reason || 'Invalid leave pattern detected');
    }
    
    // Check if any requested dates fall on existing holidays
    const { hasHolidays, holidays } = await hasHolidaysInRange(fromDate, toDate);
    if (hasHolidays && leaveType !== 'Compensation') {
      const holidayNames = holidays.map(h => `${h.name} (${h.date.toLocaleDateString('en-GB')})`);
      warnings.push(`Your leave request includes holidays: ${holidayNames.join(', ')}. Consider adjusting your dates.`);
    }
    
    // Check for weekend days in the request
    const currentDate = new Date(fromDate);
    const weekendDays: string[] = [];
    
    while (currentDate <= toDate) {
      if (isWeekend(currentDate)) {
        weekendDays.push(currentDate.toLocaleDateString('en-GB'));
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    if (weekendDays.length > 0 && leaveType !== 'Compensation') {
      warnings.push(`Your leave request includes weekends: ${weekendDays.join(', ')}. These are non-working days.`);
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
