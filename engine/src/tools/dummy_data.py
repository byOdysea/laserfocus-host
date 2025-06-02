from langchain_core.tools import tool
from typing import Dict, Any, List
import random
from datetime import datetime, timedelta
import uuid

@tool
def generate_email_data(count: int = 5) -> List[Dict[str, Any]]:
    """Generates realistic dummy email data with specified count."""
    senders = [
        ("John Doe", "john@company.com"),
        ("Sarah Wilson", "sarah.wilson@tech.com"),
        ("Mike Chen", "mchen@startup.io"),
        ("Lisa Rodriguez", "lisa@design.co"),
        ("David Kim", "david.kim@enterprise.org"),
        ("Newsletter Team", "news@techdigest.com"),
        ("HR Department", "hr@company.com"),
        ("Project Manager", "pm@agilesoft.com")
    ]
    
    subjects = [
        "Project Update - Q4 Review",
        "Meeting Tomorrow at 2 PM",
        "Weekly Tech Digest",
        "Action Required: Please Review Document", 
        "New Feature Launch Next Week",
        "Team Building Event - Save the Date",
        "Important: Security Update Required",
        "Monthly Performance Report",
        "Client Feedback on Recent Proposal",
        "Budget Planning for Next Quarter"
    ]
    
    emails = []
    for i in range(count):
        sender_name, sender_email = random.choice(senders)
        subject = random.choice(subjects)
        
        # Generate realistic email body
        body_templates = [
            f"Hi there,\n\nI wanted to follow up on {subject.lower()}. Please let me know your thoughts.\n\nBest regards,\n{sender_name}",
            f"Hello,\n\nAttached you'll find the details regarding {subject.lower()}. Looking forward to your feedback.\n\nThanks,\n{sender_name}",
            f"Team,\n\nThis is a reminder about {subject.lower()}. Please review and respond by end of day.\n\nRegards,\n{sender_name}"
        ]
        
        email = {
            "id": str(uuid.uuid4())[:8],
            "from": sender_name,
            "fromEmail": sender_email,
            "to": "me@example.com",
            "subject": subject,
            "body": random.choice(body_templates),
            "date": (datetime.now() - timedelta(days=random.randint(0, 7), hours=random.randint(0, 23))).isoformat(),
            "isRead": random.choice([True, False]),
            "isStarred": random.choice([True, False, False, False]),  # 25% chance
            "labels": random.sample(["work", "important", "meetings", "newsletter", "personal"], k=random.randint(0, 2))
        }
        
        if random.choice([True, False, False]):  # 33% chance of attachments
            email["attachments"] = [
                {"name": f"document_{i}.pdf", "size": f"{random.randint(100, 2000)} KB"}
            ]
            
        emails.append(email)
    
    return emails

@tool  
def generate_calendar_data(days_ahead: int = 30) -> List[Dict[str, Any]]:
    """Generates realistic dummy calendar events for the specified number of days ahead."""
    event_types = [
        ("Team Meeting", "Weekly team sync", 60),
        ("Client Call", "Call with potential client", 30),
        ("Project Review", "Review project progress", 90),
        ("Training Session", "Professional development", 120),
        ("One-on-One", "Manager check-in", 30),
        ("Workshop", "Skills workshop", 180),
        ("Conference Call", "Multi-team coordination", 45),
        ("Lunch Meeting", "Business lunch", 90)
    ]
    
    events = []
    for day in range(days_ahead):
        # Random chance of having events each day (70% chance)
        if random.random() < 0.7:
            num_events = random.randint(1, 3)
            
            for _ in range(num_events):
                event_name, description, duration = random.choice(event_types)
                
                # Random time during business hours
                start_hour = random.randint(9, 16)
                start_minute = random.choice([0, 15, 30, 45])
                
                start_time = datetime.now().replace(hour=start_hour, minute=start_minute, second=0, microsecond=0) + timedelta(days=day)
                end_time = start_time + timedelta(minutes=duration)
                
                event = {
                    "id": str(uuid.uuid4())[:8],
                    "title": event_name,
                    "description": description,
                    "startTime": start_time.isoformat(),
                    "endTime": end_time.isoformat(),
                    "allDay": False,
                    "location": random.choice(["Conference Room A", "Zoom", "Office", "Coffee Shop", ""]),
                    "attendees": random.sample(["john@company.com", "sarah@company.com", "mike@company.com"], k=random.randint(0, 2))
                }
                
                events.append(event)
    
    return sorted(events, key=lambda x: x["startTime"])

@tool
def generate_todo_data() -> List[Dict[str, Any]]:
    """Generates realistic dummy todo lists with tasks."""
    lists = [
        {
            "id": "work",
            "name": "Work Tasks",
            "color": "blue",
            "tasks": [
                {"id": str(uuid.uuid4())[:8], "title": "Finish project proposal", "completed": False, "priority": "high", "dueDate": (datetime.now() + timedelta(days=2)).isoformat()},
                {"id": str(uuid.uuid4())[:8], "title": "Review team code submissions", "completed": True, "priority": "medium", "dueDate": (datetime.now() + timedelta(days=1)).isoformat()},
                {"id": str(uuid.uuid4())[:8], "title": "Update project documentation", "completed": False, "priority": "low", "dueDate": (datetime.now() + timedelta(days=5)).isoformat()},
                {"id": str(uuid.uuid4())[:8], "title": "Schedule client meeting", "completed": False, "priority": "high", "dueDate": (datetime.now() + timedelta(days=1)).isoformat()},
            ]
        },
        {
            "id": "personal", 
            "name": "Personal",
            "color": "green",
            "tasks": [
                {"id": str(uuid.uuid4())[:8], "title": "Buy groceries", "completed": False, "priority": "medium", "dueDate": (datetime.now() + timedelta(days=1)).isoformat()},
                {"id": str(uuid.uuid4())[:8], "title": "Call dentist for appointment", "completed": True, "priority": "low", "dueDate": datetime.now().isoformat()},
                {"id": str(uuid.uuid4())[:8], "title": "Plan weekend trip", "completed": False, "priority": "low", "dueDate": (datetime.now() + timedelta(days=7)).isoformat()},
            ]
        },
        {
            "id": "health",
            "name": "Health & Fitness", 
            "color": "red",
            "tasks": [
                {"id": str(uuid.uuid4())[:8], "title": "Go for morning run", "completed": True, "priority": "medium", "dueDate": datetime.now().isoformat()},
                {"id": str(uuid.uuid4())[:8], "title": "Meal prep for the week", "completed": False, "priority": "medium", "dueDate": (datetime.now() + timedelta(days=1)).isoformat()},
                {"id": str(uuid.uuid4())[:8], "title": "Schedule annual checkup", "completed": False, "priority": "high", "dueDate": (datetime.now() + timedelta(days=3)).isoformat()},
            ]
        }
    ]
    
    return lists

@tool
def generate_notes_data() -> List[Dict[str, Any]]:
    """Generates realistic dummy notes data."""
    notes = [
        {
            "id": str(uuid.uuid4())[:8],
            "title": "Project Ideas",
            "content": "# Project Ideas\n\n## Web App Concepts\n- Personal productivity dashboard\n- AI-powered note organizer\n- Team collaboration tool\n\n## Mobile App Ideas\n- Habit tracking with gamification\n- Local event discovery\n- Smart expense tracker",
            "createdAt": (datetime.now() - timedelta(days=3)).isoformat(),
            "updatedAt": (datetime.now() - timedelta(days=1)).isoformat(),
            "tags": ["ideas", "projects", "development"],
            "favorite": True
        },
        {
            "id": str(uuid.uuid4())[:8], 
            "title": "Meeting Notes - Q4 Planning",
            "content": "# Q4 Planning Meeting\n\n**Date:** Today\n**Attendees:** Sarah, Mike, Lisa\n\n## Key Points\n- Budget increase approved for next quarter\n- New team member starting in 2 weeks\n- Project deadline moved to Dec 15th\n\n## Action Items\n- [ ] Update project timeline\n- [ ] Send welcome package to new hire\n- [ ] Schedule follow-up meeting",
            "createdAt": (datetime.now() - timedelta(days=1)).isoformat(),
            "updatedAt": datetime.now().isoformat(),
            "tags": ["meetings", "planning", "work"],
            "favorite": False
        },
        {
            "id": str(uuid.uuid4())[:8],
            "title": "Book Recommendations",
            "content": "# Books to Read\n\n## Technical\n- Clean Code by Robert Martin\n- The Pragmatic Programmer\n- System Design Interview\n\n## Personal Development\n- Atomic Habits\n- Deep Work\n- The Power of Now\n\n## Fiction\n- The Midnight Library\n- Project Hail Mary\n- Klara and the Sun",
            "createdAt": (datetime.now() - timedelta(days=7)).isoformat(),
            "updatedAt": (datetime.now() - timedelta(days=2)).isoformat(),
            "tags": ["books", "reading", "recommendations"],
            "favorite": False
        },
        {
            "id": str(uuid.uuid4())[:8],
            "title": "Quick Thoughts",
            "content": "Random ideas and thoughts throughout the day:\n\n- Need to research new productivity tools\n- Consider switching to a standing desk\n- Plan team building activity for next month\n- Update personal website portfolio\n- Learn more about AI/ML applications",
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat(),
            "tags": ["thoughts", "ideas"],
            "favorite": False
        }
    ]
    
    return notes

@tool
def generate_reminders_data() -> List[Dict[str, Any]]:
    """Generates realistic dummy reminders data."""
    reminders = [
        {
            "id": str(uuid.uuid4())[:8],
            "title": "Submit expense report",
            "description": "Monthly expense report due by end of day",
            "dueDate": (datetime.now() + timedelta(hours=8)).isoformat(),
            "priority": "high",
            "completed": False,
            "category": "work",
            "recurring": False
        },
        {
            "id": str(uuid.uuid4())[:8],
            "title": "Take vitamins", 
            "description": "Daily vitamin supplement",
            "dueDate": (datetime.now() + timedelta(days=1, hours=8)).isoformat(),
            "priority": "low",
            "completed": False,
            "category": "health",
            "recurring": True
        },
        {
            "id": str(uuid.uuid4())[:8],
            "title": "Call mom",
            "description": "Weekly check-in call with family",
            "dueDate": (datetime.now() + timedelta(days=2, hours=19)).isoformat(),
            "priority": "medium",
            "completed": False,
            "category": "personal",
            "recurring": True
        },
        {
            "id": str(uuid.uuid4())[:8],
            "title": "Backup computer files",
            "description": "Weekly backup to external drive",
            "dueDate": (datetime.now() + timedelta(days=5, hours=20)).isoformat(),
            "priority": "medium",
            "completed": False,
            "category": "maintenance",
            "recurring": True
        },
        {
            "id": str(uuid.uuid4())[:8],
            "title": "Review investment portfolio",
            "description": "Monthly portfolio review and rebalancing",
            "dueDate": (datetime.now() + timedelta(days=10)).isoformat(),
            "priority": "medium", 
            "completed": False,
            "category": "finance",
            "recurring": True
        },
        {
            "id": str(uuid.uuid4())[:8],
            "title": "Water plants",
            "description": "Water all indoor plants",
            "dueDate": (datetime.now() - timedelta(hours=2)).isoformat(),  # Overdue
            "priority": "low",
            "completed": False,
            "category": "home",
            "recurring": True
        }
    ]
    
    return reminders 