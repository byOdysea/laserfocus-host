import React, { useState, useEffect, useMemo } from 'react';
import {
  Inbox,
  Mail,
  Star,
  Paperclip,
  UserCircle,
  Search,
  Edit3,
  MoreVertical,
  Reply,
  Share,
  Archive,
  Trash2,
  AlertCircle,
  Loader2,
} from 'lucide-react';

// Props definition for the Email component
interface EmailDataConfig {
  filter?: 'all' | 'unread' | 'starred' | 'important';
  searchTerm?: string;
  folder?: string; // e.g., 'inbox', 'sent', 'drafts'
  initialEmailId?: string;
}

interface EmailProps {
  instanceId: string;
  viewMode: 'widget' | 'full';
  props?: {
    dataConfig?: EmailDataConfig;
  };
}

// Email object structure
interface EmailObject {
  id: string;
  sender: string;
  senderEmail: string;
  recipient: string;
  subject: string;
  body: string;
  timestamp: number;
  read: boolean;
  starred: boolean;
  attachments?: { name: string; size: string; type: string }[];
  labels?: string[];
}

// Mock data
const mockEmails: EmailObject[] = [
  {
    id: '1',
    sender: 'Alice Wonderland',
    senderEmail: 'alice@example.com',
    recipient: 'you@example.com',
    subject: 'Project Update & Next Steps',
    body: 'Hi team,\n\nJust a quick update on the project. We are on track to meet the deadline. Please find attached the latest report.\n\nBest,\nAlice',
    timestamp: Date.now() - 1000 * 60 * 5, // 5 minutes ago
    read: false,
    starred: true,
    attachments: [{ name: 'Project_Report_Q2.pdf', size: '2.5MB', type: 'pdf' }],
    labels: ['work', 'important'],
  },
  {
    id: '2',
    sender: 'Bob The Builder',
    senderEmail: 'bob@example.com',
    recipient: 'you@example.com',
    subject: 'Weekend Plans - BBQ?',
    body: 'Hey! Thinking of having a BBQ this weekend if the weather holds up. Are you free to join? Let me know!\n\nCheers,\nBob',
    timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
    read: true,
    starred: false,
    labels: ['personal'],
  },
  {
    id: '3',
    sender: 'Charlie Brown',
    senderEmail: 'charlie@example.com',
    recipient: 'you@example.com',
    subject: 'Your Monthly Newsletter is here!',
    body: 'Hello,\n\nYour latest newsletter is packed with exciting news and updates. Click here to read more!\n\nThanks,\nThe Newsletter Team',
    timestamp: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
    read: false,
    starred: false,
  },
  {
    id: '4',
    sender: 'Diana Prince',
    senderEmail: 'diana@example.com',
    recipient: 'you@example.com',
    subject: 'Invoice #INV12345 Due Soon',
    body: 'Dear Customer,\n\nThis is a friendly reminder that your invoice #INV12345 for $50.00 is due on [Date].\n\nPlease ensure timely payment.\n\nSincerely,\nBilling Department',
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 3, // 3 days ago
    read: true,
    starred: true,
    labels: ['finance', 'important'],
  },
  {
    id: '5',
    sender: 'Edward Scissorhands',
    senderEmail: 'edward@example.com',
    recipient: 'you@example.com',
    subject: 'Quick Question about the Garden Design',
    body: 'Hi,\n\nI had a quick question regarding the hedge trimming schedule we discussed. Could you clarify the preferred dates?\n\nThanks,\nEdward',
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 5, // 5 days ago
    read: false,
    starred: false,
    attachments: [{ name: 'Garden_Sketch.jpg', size: '1.2MB', type: 'image' }],
  },
  {
    id: '6',
    sender: 'Fiona Gallagher',
    senderEmail: 'fiona@example.com',
    recipient: 'you@example.com',
    subject: 'Re: Your Application Status',
    body: 'Dear Applicant,\n\nThank you for your interest. We have reviewed your application and would like to invite you for an interview.\n\nRegards,\nHR Team',
    timestamp: Date.now() - 1000 * 60 * 30, // 30 minutes ago
    read: false,
    starred: true,
    labels: ['career', 'important'],
  },
  {
    id: '7',
    sender: 'George Jetson',
    senderEmail: 'george@example.com',
    recipient: 'you@example.com',
    subject: 'Spacely Sprockets New Product Launch!',
    body: 'Get ready for the future! Spacely Sprockets is launching a new line of automated dog walkers. Pre-order yours today!\n\nBest,\nGeorge',
    timestamp: Date.now() - 1000 * 60 * 60 * 5, // 5 hours ago
    read: true,
    starred: false,
  },
];

const formatTimestamp = (timestamp: number): string => {
  const now = new Date();
  const date = new Date(timestamp);
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 7) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } else if (days > 0) {
    return `${days}d ago`;
  } else if (hours > 0) {
    return `${hours}h ago`;
  } else if (minutes > 0) {
    return `${minutes}m ago`;
  } else {
    return 'Just now';
  }
};

const Email: React.FC<EmailProps> = ({ viewMode, props }) => {
  const dataConfig = props?.dataConfig;
  const [emails, setEmails] = useState<EmailObject[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailObject | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentSearchTerm, setCurrentSearchTerm] = useState(dataConfig?.searchTerm || '');

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Simulate API call
    setTimeout(() => {
      try {
        let filteredEmails = [...mockEmails];

        if (dataConfig?.filter === 'unread') {
          filteredEmails = filteredEmails.filter(email => !email.read);
        } else if (dataConfig?.filter === 'starred') {
          filteredEmails = filteredEmails.filter(email => email.starred);
        }
        // Add more filters for 'important', 'folder' etc. as needed

        if (currentSearchTerm) {
          const lowerSearchTerm = currentSearchTerm.toLowerCase();
          filteredEmails = filteredEmails.filter(
            email =>
              email.subject.toLowerCase().includes(lowerSearchTerm) ||
              email.sender.toLowerCase().includes(lowerSearchTerm) ||
              email.body.toLowerCase().includes(lowerSearchTerm)
          );
        }

        // Sort by newest first
        filteredEmails.sort((a, b) => b.timestamp - a.timestamp);
        setEmails(filteredEmails);

        if (dataConfig?.initialEmailId) {
            const initialEmail = filteredEmails.find(e => e.id === dataConfig.initialEmailId);
            if (initialEmail) setSelectedEmail(initialEmail);
        } else if (viewMode === 'full' && filteredEmails.length > 0) {
            // setSelectedEmail(filteredEmails[0]); // Optionally select the first email by default in full view
        }


      } catch (e) {
        setError('Failed to load emails.');
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 500);
  }, [dataConfig, currentSearchTerm, viewMode]);

  const handleSelectEmail = (email: EmailObject) => {
    setSelectedEmail(email);
    // Mark as read locally
    setEmails(prevEmails =>
      prevEmails.map(e => (e.id === email.id ? { ...e, read: true } : e))
    );
  };

  const unreadCount = useMemo(() => emails.filter(e => !e.read).length, [emails]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-full bg-gray-50 text-gray-700 ${viewMode === 'widget' ? 'aspect-[16/9]' : 'p-4'}`}>
        <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
        <span className="ml-2">Loading emails...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center h-full bg-red-50 text-red-700 ${viewMode === 'widget' ? 'aspect-[16/9]' : 'p-4'}`}>
        <AlertCircle className="h-8 w-8 mb-2" />
        <span>{error}</span>
      </div>
    );
  }

  if (viewMode === 'widget') {
    return (
      <div className="bg-white text-gray-800 p-3 shadow-lg rounded-lg flex flex-col aspect-[16/9] overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-blue-600 flex items-center">
            <Inbox size={20} className="mr-2" />
            Inbox
          </h2>
          {unreadCount > 0 && (
            <span className="text-xs bg-red-500 text-white font-bold px-2 py-1 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex-grow overflow-y-auto space-y-1 pr-1">
          {emails.slice(0, 5).map(email => (
            <div
              key={email.id}
              onClick={() => alert(`Opening email: ${email.subject}`)} // Simple interaction for widget
              className={`p-2 rounded-md hover:bg-gray-100 cursor-pointer border-l-4 ${
                !email.read ? 'border-blue-500 bg-blue-50' : 'border-transparent'
              }`}
            >
              <div className="flex justify-between items-center text-xs text-gray-500 mb-0.5">
                <span className={`truncate max-w-[60%] ${!email.read ? 'font-semibold text-gray-700' : ''}`}>{email.sender}</span>
                <span>{formatTimestamp(email.timestamp)}</span>
              </div>
              <p className={`text-sm truncate ${!email.read ? 'font-bold text-gray-800' : 'text-gray-700'}`}>
                {email.subject}
              </p>
            </div>
          ))}
          {emails.length === 0 && <p className="text-sm text-gray-500 text-center py-4">No new emails.</p>}
        </div>
         {emails.length > 5 && (
          <button className="mt-2 text-sm text-blue-600 hover:underline w-full text-left">
            View all emails...
          </button>
        )}
      </div>
    );
  }

  // Full Window View (optimized for portrait)
  return (
    <div className="flex flex-col h-full bg-gray-100 text-gray-800">
      {/* Header */}
      <header className="bg-white shadow-sm p-3 flex items-center justify-between border-b border-gray-200">
        <div className="flex items-center">
          <Mail size={24} className="text-blue-600 mr-2" />
          <h1 className="text-xl font-semibold">Email Client</h1>
        </div>
        <div className="flex items-center space-x-2">
          <button className="p-2 rounded-md hover:bg-gray-200 text-gray-600">
            <Edit3 size={20} />
          </button>
          <button className="p-2 rounded-md hover:bg-gray-200 text-gray-600">
            <MoreVertical size={20} />
          </button>
        </div>
      </header>

      {/* Main Content (Two-pane layout) */}
      <div className="flex flex-grow overflow-hidden">
        {/* Sidebar (Email List) - Optimized for portrait, could be full width on smaller screens or collapsible */}
        <aside className="w-full md:w-2/5 lg:w-1/3 bg-white border-r border-gray-200 flex flex-col overflow-y-hidden">
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <input
                type="text"
                placeholder="Search mail..."
                value={currentSearchTerm}
                onChange={(e) => setCurrentSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              <Search
                size={18}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              />
            </div>
          </div>
          <div className="flex-grow overflow-y-auto">
            {emails.map(email => (
              <div
                key={email.id}
                onClick={() => handleSelectEmail(email)}
                className={`p-3 cursor-pointer border-b border-gray-200 hover:bg-gray-50 ${
                  selectedEmail?.id === email.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                } ${!email.read && selectedEmail?.id !== email.id ? 'bg-yellow-50' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <span className={`text-sm font-medium truncate max-w-[70%] ${!email.read ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                    {email.sender}
                  </span>
                  <span className="text-xs text-gray-500 whitespace-nowrap">{formatTimestamp(email.timestamp)}</span>
                </div>
                <p className={`text-sm truncate mt-0.5 ${!email.read && selectedEmail?.id !== email.id ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                  {email.subject}
                </p>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {email.body.substring(0, 50)}...
                </p>
                <div className="flex items-center mt-1 space-x-2">
                  {email.starred && <Star size={14} className="text-yellow-500 fill-current" />}
                  {email.attachments && email.attachments.length > 0 && <Paperclip size={14} className="text-gray-500" />}
                </div>
              </div>
            ))}
            {emails.length === 0 && (
              <p className="text-center text-gray-500 p-4">No emails found.</p>
            )}
          </div>
        </aside>

        {/* Main Content (Email View) */}
        <main className="flex-grow bg-white p-4 overflow-y-auto">
          {selectedEmail ? (
            <div>
              <div className="pb-3 border-b border-gray-200 mb-3">
                <h2 className="text-xl font-semibold mb-1">{selectedEmail.subject}</h2>
                <div className="flex items-center text-sm text-gray-600">
                  <UserCircle size={20} className="mr-2 text-gray-500" />
                  <div>
                    <span className="font-medium">{selectedEmail.sender}</span>
                    <span className="text-gray-500 ml-1">&lt;{selectedEmail.senderEmail}&gt;</span>
                  </div>
                  <span className="ml-auto text-xs text-gray-500">{new Date(selectedEmail.timestamp).toLocaleString()}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">To: {selectedEmail.recipient}</div>
              </div>

              <div className="flex items-center space-x-2 mb-4">
                <button className="flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-100 text-gray-700">
                  <Reply size={16} className="mr-1.5" /> Reply
                </button>
                <button className="flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-100 text-gray-700">
                  <Share size={16} className="mr-1.5 transform scale-x-[-1]" /> Forward {/* Lucide doesn't have forward, using mirrored share */}
                </button>
                <button className="flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-100 text-gray-700">
                  <Archive size={16} className="mr-1.5" /> Archive
                </button>
                <button className="flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-100 text-red-600 hover:border-red-400">
                  <Trash2 size={16} className="mr-1.5" /> Delete
                </button>
              </div>

              {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                <div className="mb-4 p-3 bg-gray-50 rounded-md border border-gray-200">
                  <h4 className="text-sm font-medium mb-2 text-gray-700">Attachments ({selectedEmail.attachments.length})</h4>
                  <div className="space-y-1.5">
                    {selectedEmail.attachments.map((att, index) => (
                      <a
                        key={index}
                        href="#" // Replace with actual download link
                        className="flex items-center text-sm text-blue-600 hover:underline p-1.5 rounded hover:bg-blue-50"
                      >
                        <Paperclip size={16} className="mr-2 flex-shrink-0" />
                        <span className="truncate mr-2">{att.name}</span>
                        <span className="text-xs text-gray-500 ml-auto whitespace-nowrap">({att.size})</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap">
                {selectedEmail.body}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Mail size={48} className="mb-4" />
              <p className="text-lg">Select an email to read</p>
              <p className="text-sm">Or, start by composing a new message.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Email;
