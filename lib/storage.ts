
import type { User, FinancialRequest } from '../types';

const USERS_KEY = 'ludo_users';
const REQUESTS_KEY = 'ludo_requests';

// Seed data
const INITIAL_USERS: User[] = [
  { id: 'u000', username: 'admin', password: '123', balance: 99999, role: 'ADMIN', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Admin', status: 'Active', joined: new Date().toISOString() },
  { id: 'u001', username: 'Alice', password: '123', balance: 1250, role: 'USER', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice', status: 'Active', joined: '2023-10-15' },
  { id: 'u002', username: 'Bob', password: '123', balance: 800, role: 'USER', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob', status: 'Active', joined: '2023-10-18' },
];

const INITIAL_REQUESTS: FinancialRequest[] = [
    { id: 'r001', userId: 'u002', userName: 'Bob', type: 'DEPOSIT', amount: 500, status: 'PENDING', timestamp: new Date().toISOString(), details: 'Initial funding' },
];

export const storage = {
    init: () => {
        if (!localStorage.getItem(USERS_KEY)) {
            localStorage.setItem(USERS_KEY, JSON.stringify(INITIAL_USERS));
        }
        if (!localStorage.getItem(REQUESTS_KEY)) {
            localStorage.setItem(REQUESTS_KEY, JSON.stringify(INITIAL_REQUESTS));
        }
    },

    getUsers: (): User[] => {
        try {
            return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
        } catch { return []; }
    },

    getRequests: (): FinancialRequest[] => {
        try {
            return JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]');
        } catch { return []; }
    },

    saveUsers: (users: User[]) => {
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
    },

    saveRequests: (requests: FinancialRequest[]) => {
        localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
    },

    // Auth
    login: (username: string, password: string): User | null => {
        const users = storage.getUsers();
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
        return user || null;
    },

    register: (username: string, password: string): User => {
        const users = storage.getUsers();
        if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
            throw new Error('Username already exists');
        }
        const newUser: User = {
            id: 'u' + Date.now().toString().slice(-6),
            username,
            password, // In a real app, hash this!
            balance: 100, // Sign up bonus
            role: 'USER',
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
            status: 'Active',
            joined: new Date().toISOString(),
        };
        users.push(newUser);
        storage.saveUsers(users);
        return newUser;
    },

    // Wallet
    createRequest: (userId: string, userName: string, type: 'DEPOSIT' | 'WITHDRAWAL', amount: number) => {
        const requests = storage.getRequests();
        const newReq: FinancialRequest = {
            id: 'r' + Date.now().toString().slice(-6),
            userId,
            userName,
            type,
            amount,
            status: 'PENDING',
            timestamp: new Date().toISOString(),
            details: 'User Request'
        };
        requests.push(newReq);
        storage.saveRequests(requests);
        return newReq;
    },

    // Admin Actions
    processRequest: (requestId: string, approve: boolean) => {
        const requests = storage.getRequests();
        const users = storage.getUsers();

        const reqIndex = requests.findIndex(r => r.id === requestId);
        if (reqIndex === -1) return;

        const req = requests[reqIndex];
        const userIndex = users.findIndex(u => u.id === req.userId);

        if (approve) {
            if (req.type === 'DEPOSIT') {
                if (userIndex !== -1) {
                    users[userIndex].balance += req.amount;
                    req.status = 'APPROVED';
                }
            } else if (req.type === 'WITHDRAWAL') {
                if (userIndex !== -1) {
                    if (users[userIndex].balance >= req.amount) {
                        users[userIndex].balance -= req.amount;
                        req.status = 'APPROVED';
                    } else {
                        // Not enough funds even though admin approved?
                        // Reject it or handle error. For simplicity, reject.
                        req.status = 'REJECTED'; 
                        req.details = 'Insufficient funds at approval time';
                    }
                }
            }
        } else {
            req.status = 'REJECTED';
        }

        storage.saveRequests(requests);
        storage.saveUsers(users);
    }
};

// Initialize on load
storage.init();
