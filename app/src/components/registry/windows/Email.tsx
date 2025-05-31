import { Archive, Forward, Mail, MoreVertical, Plus, Reply, ReplyAll, Search, Send, Star, Trash2 } from 'lucide-react';
import React from 'react';

interface EmailMessage {
  id: string;
  from: string;
  fromEmail: string;
  to: string;
  cc?: string[];
  subject: string;
  body: string;
  date: Date;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
  attachments?: Array<{ name: string; size: string }>;
}

interface EmailProps {
  isWidget?: boolean;
  viewMode?: 'list' | 'single';  // New prop for view mode
  directEmailId?: string | null;  // New prop to directly set email to view
  emails?: EmailMessage[];
  selectedEmail?: string | null;
  filter?: 'all' | 'unread' | 'starred' | 'sent' | 'drafts' | 'trash';
  searchQuery?: string;
  isComposing?: boolean;
  composeData?: {
    to: string;
    cc?: string;
    subject: string;
    body: string;
    isReply?: boolean;
    isReplyAll?: boolean;
    isForward?: boolean;
    originalEmailId?: string;
  };
  onEmailSelect?: (id: string) => void;
  onCompose?: () => void;
  onSend?: (data: any) => void;
  onDelete?: (id: string) => void;
  onArchive?: (id: string) => void;
  onStar?: (id: string) => void;
  onMarkRead?: (id: string) => void;
  onReply?: (emailId: string, replyAll?: boolean) => void;
  onForward?: (emailId: string) => void;
  onBackToList?: () => void;
}

const defaultEmails: EmailMessage[] = [
  {
    id: '1',
    from: 'John Doe',
    fromEmail: 'john@example.com',
    to: 'me@example.com',
    cc: ['team@example.com', 'manager@example.com'],
    subject: 'Project Update - Q4 Review',
    body: `Hi there,

I wanted to share the latest updates on our Q4 project. Everything is on track and we're making great progress.

Key accomplishments:
- Feature A completed ahead of schedule
- Performance improvements showing 25% better results
- User feedback has been overwhelmingly positive

Next steps:
- Review with stakeholders next Tuesday
- Begin planning for Q1 initiatives
- Update documentation

Let me know if you have any questions!

Best regards,
John`,
    date: new Date('2024-01-15T10:30:00'),
    isRead: false,
    isStarred: true,
    labels: ['work', 'important'],
    attachments: [
      { name: 'Q4_Report.pdf', size: '2.3 MB' },
      { name: 'Performance_Metrics.xlsx', size: '456 KB' }
    ]
  },
  {
    id: '2',
    from: 'Jane Smith',
    fromEmail: 'jane@example.com',
    to: 'me@example.com',
    subject: 'Meeting Tomorrow at 2 PM',
    body: 'Just a reminder about our meeting tomorrow to discuss the new features. Please bring your notes from last week.',
    date: new Date('2024-01-15T09:15:00'),
    isRead: true,
    isStarred: false,
    labels: ['meetings']
  },
  {
    id: '3',
    from: 'Newsletter',
    fromEmail: 'news@techblog.com',
    to: 'me@example.com',
    subject: 'Weekly Tech Digest',
    body: 'This week in tech: AI advances, new frameworks, and more...',
    date: new Date('2024-01-14T16:00:00'),
    isRead: true,
    isStarred: false,
    labels: ['newsletter']
  }
];

const Email: React.FC<EmailProps> = ({
  isWidget = false,
  viewMode = 'list',
  directEmailId = null,
  emails = defaultEmails,
  selectedEmail = null,
  filter = 'all',
  searchQuery = '',
  isComposing = false,
  composeData = { to: '', subject: '', body: '' },
  onEmailSelect = () => {},
  onCompose = () => {},
  onSend = () => {},
  onDelete = () => {},
  onArchive = () => {},
  onStar = () => {},
  onMarkRead = () => {},
  onReply = () => {},
  onForward = () => {},
  onBackToList = () => {}
}) => {
  const unreadCount = emails.filter(e => !e.isRead).length;
  
  // Use directEmailId if provided, otherwise use selectedEmail
  const currentEmailId = directEmailId || selectedEmail;
  const selectedEmailData = emails.find(e => e.id === currentEmailId);
  
  if (isWidget) {
    // Widget view - display only, no interactions
    return (
      <div className="h-full flex flex-col bg-white overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-gray-900">Email</span>
            </div>
            {unreadCount > 0 && (
              <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full font-medium">
                {unreadCount}
              </span>
            )}
          </div>
        </div>
        
        {/* Email list - takes available space */}
        <div className="flex-1 px-4 py-2 overflow-hidden">
          <div className="space-y-3">
            {emails.slice(0, 3).map(email => (
              <div key={email.id} className="-mx-2 px-2 py-2">
                <div className="flex items-start gap-2">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-xs font-medium text-blue-600">
                      {email.from.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {email.from}
                      </div>
                      <div className="text-xs text-gray-500 ml-2">
                        {email.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 truncate mt-1">{email.subject}</div>
                    {!email.isRead && (
                      <div className="w-2 h-2 bg-blue-600 rounded-full mt-1"></div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Footer - just display info */}
        <div className="px-4 pb-4 pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-500 text-center">
            {emails.length} total emails
          </div>
        </div>
      </div>
    );
  }

  // Single email view mode
  if (viewMode === 'single' && selectedEmailData) {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="border-b border-gray-200">
          <div className="p-4 flex items-center justify-between">
            <button
              onClick={onBackToList}
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back to inbox
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onStar(selectedEmailData.id)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <Star className={`w-5 h-5 ${selectedEmailData.isStarred ? 'text-yellow-500 fill-current' : 'text-gray-400'}`} />
              </button>
              <button
                onClick={() => onArchive(selectedEmailData.id)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <Archive className="w-5 h-5 text-gray-400" />
              </button>
              <button
                onClick={() => onDelete(selectedEmailData.id)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <Trash2 className="w-5 h-5 text-gray-400" />
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg">
                <MoreVertical className="w-5 h-5 text-gray-400" />
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            <h1 className="text-2xl font-semibold mb-4">{selectedEmailData.subject}</h1>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                    {selectedEmailData.from.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold">{selectedEmailData.from}</div>
                    <div className="text-sm text-gray-600">&lt;{selectedEmailData.fromEmail}&gt;</div>
                    <div className="text-sm text-gray-500 mt-1">
                      to {selectedEmailData.to}
                      {selectedEmailData.cc && selectedEmailData.cc.length > 0 && (
                        <span>, cc: {selectedEmailData.cc.join(', ')}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {selectedEmailData.date.toLocaleString()}
                </div>
              </div>
              
              {selectedEmailData.labels.length > 0 && (
                <div className="flex gap-2">
                  {selectedEmailData.labels.map(label => (
                    <span key={label} className="text-xs bg-gray-200 px-2 py-1 rounded">
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            
            <div className="prose max-w-none mb-6">
              <pre className="whitespace-pre-wrap font-sans">{selectedEmailData.body}</pre>
            </div>
            
            {selectedEmailData.attachments && selectedEmailData.attachments.length > 0 && (
              <div className="mb-6">
                <h3 className="font-medium mb-2">Attachments</h3>
                <div className="space-y-2">
                  {selectedEmailData.attachments.map((attachment, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer">
                      <div className="text-sm font-medium">{attachment.name}</div>
                      <div className="text-sm text-gray-500">{attachment.size}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="border-t border-gray-200 p-4">
          <div className="flex gap-3">
            <button
              onClick={() => onReply(selectedEmailData.id, false)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
            >
              <Reply className="w-4 h-4" />
              Reply
            </button>
            <button
              onClick={() => onReply(selectedEmailData.id, true)}
              className="px-4 py-2 border border-gray-300 rounded-lg flex items-center gap-2 hover:bg-gray-50"
            >
              <ReplyAll className="w-4 h-4" />
              Reply All
            </button>
            <button
              onClick={() => onForward(selectedEmailData.id)}
              className="px-4 py-2 border border-gray-300 rounded-lg flex items-center gap-2 hover:bg-gray-50"
            >
              <Forward className="w-4 h-4" />
              Forward
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Full window list view
  const filteredEmails = emails.filter(email => {
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      return email.subject.toLowerCase().includes(search) ||
             email.from.toLowerCase().includes(search) ||
             email.body.toLowerCase().includes(search);
    }
    switch (filter) {
      case 'unread': return !email.isRead;
      case 'starred': return email.isStarred;
      default: return true;
    }
  });

  return (
    <div className="h-full flex bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 p-4">
        <button
          onClick={onCompose}
          className="w-full bg-blue-600 text-white rounded-lg py-2 px-4 mb-4 flex items-center justify-center gap-2 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Compose
        </button>
        
        <nav className="space-y-1">
          {['all', 'unread', 'starred', 'sent', 'drafts', 'trash'].map(f => (
            <button
              key={f}
              className={`w-full text-left px-3 py-2 rounded-lg capitalize ${
                filter === f ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-100'
              }`}
            >
              {f}
            </button>
          ))}
        </nav>
      </div>

      {/* Email List */}
      <div className="w-96 bg-white border-r border-gray-200">
        <div className="p-3 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search emails..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg"
              value={searchQuery}
            />
          </div>
        </div>
        
        <div className="overflow-y-auto">
          {filteredEmails.map(email => (
            <div
              key={email.id}
              onClick={() => onEmailSelect(email.id)}
              className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 ${
                !email.isRead ? 'bg-blue-50' : ''
              } ${currentEmailId === email.id ? 'border-l-4 border-blue-600' : ''}`}
            >
              <div className="flex items-start justify-between mb-1">
                <span className={`text-sm ${!email.isRead ? 'font-semibold' : ''}`}>
                  {email.from}
                </span>
                <div className="flex items-center gap-2">
                  {email.isStarred && <Star className="w-4 h-4 text-yellow-500 fill-current" />}
                  <span className="text-xs text-gray-500">
                    {email.date.toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="text-sm font-medium mb-1">{email.subject}</div>
              <div className="text-xs text-gray-600 truncate">{email.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Email Content / Compose */}
      <div className="flex-1 bg-white">
        {isComposing ? (
          <div className="h-full flex flex-col p-6">
            <h2 className="text-xl font-semibold mb-4">
              {composeData.isReply ? 'Reply' : composeData.isForward ? 'Forward' : 'New Message'}
            </h2>
            <div className="space-y-4 flex-1 flex flex-col">
              <input
                type="text"
                placeholder="To"
                className="w-full p-2 border border-gray-300 rounded"
                value={composeData.to}
              />
              {composeData.isReplyAll && (
                <input
                  type="text"
                  placeholder="Cc"
                  className="w-full p-2 border border-gray-300 rounded"
                  value={composeData.cc || ''}
                />
              )}
              <input
                type="text"
                placeholder="Subject"
                className="w-full p-2 border border-gray-300 rounded"
                value={composeData.subject}
              />
              <textarea
                placeholder="Write your message..."
                className="flex-1 p-3 border border-gray-300 rounded resize-none"
                value={composeData.body}
              />
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => onSend(composeData)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
              >
                <Send className="w-4 h-4" />
                Send
              </button>
              <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Save Draft
              </button>
              <button className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        ) : selectedEmailData ? (
          <div className="h-full flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-semibold mb-2">{selectedEmailData.subject}</h2>
                  <div className="text-sm text-gray-600">
                    From: <span className="font-medium">{selectedEmailData.from}</span> &lt;{selectedEmailData.fromEmail}&gt;
                  </div>
                  <div className="text-sm text-gray-600">
                    To: {selectedEmailData.to}
                    {selectedEmailData.cc && selectedEmailData.cc.length > 0 && (
                      <span>, Cc: {selectedEmailData.cc.join(', ')}</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {selectedEmailData.date.toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onStar(selectedEmailData.id)}
                    className="p-2 hover:bg-gray-100 rounded"
                  >
                    <Star className={`w-5 h-5 ${selectedEmailData.isStarred ? 'text-yellow-500 fill-current' : 'text-gray-400'}`} />
                  </button>
                  <button
                    onClick={() => onArchive(selectedEmailData.id)}
                    className="p-2 hover:bg-gray-100 rounded"
                  >
                    <Archive className="w-5 h-5 text-gray-400" />
                  </button>
                  <button
                    onClick={() => onDelete(selectedEmailData.id)}
                    className="p-2 hover:bg-gray-100 rounded"
                  >
                    <Trash2 className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                {selectedEmailData.labels.map(label => (
                  <span key={label} className="text-xs bg-gray-200 px-2 py-1 rounded">
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="prose max-w-none">
                <pre className="whitespace-pre-wrap font-sans">{selectedEmailData.body}</pre>
              </div>
              {selectedEmailData.attachments && selectedEmailData.attachments.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="font-medium mb-2">Attachments</h3>
                  <div className="space-y-2">
                    {selectedEmailData.attachments.map((attachment, index) => (
                      <div key={index} className="inline-flex items-center gap-2 p-2 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer mr-2">
                        <div className="text-sm font-medium">{attachment.name}</div>
                        <div className="text-sm text-gray-500">{attachment.size}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => onReply(selectedEmailData.id, false)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
              >
                <Reply className="w-4 h-4" />
                Reply
              </button>
              <button
                onClick={() => onReply(selectedEmailData.id, true)}
                className="px-4 py-2 border border-gray-300 rounded-lg flex items-center gap-2 hover:bg-gray-50"
              >
                <ReplyAll className="w-4 h-4" />
                Reply All
              </button>
              <button
                onClick={() => onForward(selectedEmailData.id)}
                className="px-4 py-2 border border-gray-300 rounded-lg flex items-center gap-2 hover:bg-gray-50"
              >
                <Forward className="w-4 h-4" />
                Forward
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            Select an email to read
          </div>
        )}
      </div>
    </div>
  );
};

export default Email;