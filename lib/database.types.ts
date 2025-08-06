export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string;
          role: 'Staff' | 'Director';
          department: string;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name: string;
          role: 'Staff' | 'Director';
          department: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string;
          role?: 'Staff' | 'Director';
          department?: string;
          created_at?: string;
        };
      };
      leave_requests: {
        Row: {
          id: string;
          user_id: string;
          emp_id: string;
          department: string;
          leave_type: string;
          from_date: string;
          to_date: string;
          reason: string;
          file_url: string | null;
          status: 'Pending' | 'Approved' | 'Rejected';
          remark: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          emp_id: string;
          department: string;
          leave_type: string;
          from_date: string;
          to_date: string;
          reason: string;
          file_url?: string | null;
          status?: 'Pending' | 'Approved' | 'Rejected';
          remark?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          emp_id?: string;
          department?: string;
          leave_type?: string;
          from_date?: string;
          to_date?: string;
          reason?: string;
          file_url?: string | null;
          status?: 'Pending' | 'Approved' | 'Rejected';
          remark?: string | null;
          created_at?: string;
        };
      };
    };
  };
}