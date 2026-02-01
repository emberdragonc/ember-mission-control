#!/usr/bin/env node

/**
 * Mission Control CLI v0.2
 * 
 * Usage:
 *   mc task create "Title" --assign agent1,agent2
 *   mc task list [--status inbox|assigned|in_progress|review|done]
 *   mc task update <id> --status <status>
 *   mc task comment <id> <agentId> "Comment"
 *   mc task view <id>
 *   mc notify @agent "message"
 *   mc activity [--limit 10]
 *   mc standup
 *   mc check <agentId>
 *   mc working <agentId> [--set "current task"]
 *   mc doc create "Title" --type deliverable|research|protocol --task <id>
 *   mc doc list [--type type] [--task id]
 *   mc agents
 */

const fs = require('fs');
const path = require('path');

const MC_DIR = path.join(__dirname, '..', '.mission-control');
const AGENTS_DIR = path.join(__dirname, '..', 'agents');

// Load JSON file
function load(file) {
  const filepath = path.join(MC_DIR, file);
  if (!fs.existsSync(filepath)) {
    // Initialize if doesn't exist
    const defaults = {
      'tasks.json': { tasks: [], nextId: 1 },
      'notifications.json': { notifications: [], nextId: 1 },
      'activity.json': { activities: [], nextId: 1 },
      'documents.json': { documents: [], nextId: 1 }
    };
    if (defaults[file]) {
      fs.writeFileSync(filepath, JSON.stringify(defaults[file], null, 2));
    }
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

// Save JSON file
function save(file, data) {
  const filepath = path.join(MC_DIR, file);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

// Log activity
function logActivity(type, agentId, message) {
  const data = load('activity.json');
  data.activities.push({
    id: data.nextId++,
    type,
    agentId,
    message,
    timestamp: new Date().toISOString()
  });
  if (data.activities.length > 100) {
    data.activities = data.activities.slice(-100);
  }
  save('activity.json', data);
}

// Create notification
function createNotification(mentionedAgentId, content, fromAgentId = 'system') {
  const data = load('notifications.json');
  data.notifications.push({
    id: data.nextId++,
    mentionedAgentId,
    fromAgentId,
    content,
    delivered: false,
    createdAt: new Date().toISOString()
  });
  save('notifications.json', data);
}

// Get/set WORKING.md for an agent
function getWorkingPath(agentId) {
  return path.join(AGENTS_DIR, agentId, 'WORKING.md');
}

function getWorking(agentId) {
  const workingPath = getWorkingPath(agentId);
  if (fs.existsSync(workingPath)) {
    return fs.readFileSync(workingPath, 'utf8');
  }
  return null;
}

function setWorking(agentId, taskId, taskTitle, status = 'in_progress') {
  const workingPath = getWorkingPath(agentId);
  const agentDir = path.dirname(workingPath);
  if (!fs.existsSync(agentDir)) {
    fs.mkdirSync(agentDir, { recursive: true });
  }
  
  const content = `# WORKING.md — ${agentId}

## Current Task
**Task #${taskId}:** ${taskTitle}

## Status
${status === 'in_progress' ? '🔄 IN PROGRESS' : '👀 IN REVIEW'}

## Updated
${new Date().toISOString()}

## Notes
<!-- Add your notes here -->

`;
  fs.writeFileSync(workingPath, content);
}

function clearWorking(agentId) {
  const workingPath = getWorkingPath(agentId);
  if (fs.existsSync(workingPath)) {
    const content = `# WORKING.md — ${agentId}

## Current Task
None - available for new work

## Updated
${new Date().toISOString()}
`;
    fs.writeFileSync(workingPath, content);
  }
}

// Commands
const commands = {
  task: {
    create: (args) => {
      const title = args[0];
      if (!title) {
        console.error('Usage: mc task create "Title" [--assign agent1,agent2] [--desc "Description"]');
        process.exit(1);
      }
      
      const assignIndex = args.indexOf('--assign');
      const descIndex = args.indexOf('--desc');
      
      const assignees = assignIndex > -1 ? args[assignIndex + 1].split(',') : [];
      const description = descIndex > -1 ? args[descIndex + 1] : '';
      
      const data = load('tasks.json');
      const task = {
        id: data.nextId++,
        title,
        description,
        status: assignees.length > 0 ? 'assigned' : 'inbox',
        assigneeIds: assignees,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        comments: [],
        documents: []
      };
      data.tasks.push(task);
      save('tasks.json', data);
      
      logActivity('task_created', 'system', `Task #${task.id}: ${title}`);
      
      assignees.forEach(agentId => {
        createNotification(agentId, `📋 New task assigned: #${task.id} - ${title}`);
      });
      
      console.log(`✅ Created task #${task.id}: ${title}`);
      if (assignees.length > 0) {
        console.log(`   Assigned to: ${assignees.join(', ')}`);
      }
    },
    
    list: (args) => {
      const statusIndex = args.indexOf('--status');
      const filterStatus = statusIndex > -1 ? args[statusIndex + 1] : null;
      const assigneeIndex = args.indexOf('--assignee');
      const filterAssignee = assigneeIndex > -1 ? args[assigneeIndex + 1] : null;
      
      const data = load('tasks.json');
      let tasks = data.tasks;
      
      if (filterStatus) {
        tasks = tasks.filter(t => t.status === filterStatus);
      }
      if (filterAssignee) {
        tasks = tasks.filter(t => t.assigneeIds.includes(filterAssignee));
      }
      
      if (tasks.length === 0) {
        console.log('No tasks found.');
        return;
      }
      
      const statusEmoji = {
        inbox: '📥',
        assigned: '👤',
        in_progress: '🔄',
        review: '👀',
        done: '✅',
        blocked: '🚫'
      };
      
      tasks.forEach(t => {
        const emoji = statusEmoji[t.status] || '📋';
        const assignees = t.assigneeIds.length > 0 ? ` [${t.assigneeIds.join(', ')}]` : '';
        console.log(`${emoji} #${t.id} ${t.title}${assignees} (${t.status})`);
      });
    },
    
    view: (args) => {
      const id = parseInt(args[0]);
      if (isNaN(id)) {
        console.error('Usage: mc task view <id>');
        process.exit(1);
      }
      
      const data = load('tasks.json');
      const task = data.tasks.find(t => t.id === id);
      
      if (!task) {
        console.error(`Task #${id} not found`);
        process.exit(1);
      }
      
      const statusEmoji = {
        inbox: '📥', assigned: '👤', in_progress: '🔄',
        review: '👀', done: '✅', blocked: '🚫'
      };
      
      console.log(`\n${statusEmoji[task.status]} Task #${task.id}: ${task.title}`);
      console.log(`${'─'.repeat(50)}`);
      console.log(`Status: ${task.status}`);
      console.log(`Assignees: ${task.assigneeIds.join(', ') || 'None'}`);
      console.log(`Created: ${task.createdAt}`);
      if (task.description) {
        console.log(`\nDescription:\n${task.description}`);
      }
      
      if (task.comments.length > 0) {
        console.log(`\n💬 Comments (${task.comments.length}):`);
        task.comments.forEach(c => {
          const time = new Date(c.timestamp).toLocaleString();
          console.log(`  [${time}] @${c.agentId}: ${c.content}`);
        });
      }
      
      if (task.documents && task.documents.length > 0) {
        console.log(`\n📄 Documents: ${task.documents.join(', ')}`);
      }
      console.log('');
    },
    
    update: (args) => {
      const id = parseInt(args[0]);
      if (isNaN(id)) {
        console.error('Usage: mc task update <id> --status <status> [--agent <agentId>]');
        process.exit(1);
      }
      
      const statusIndex = args.indexOf('--status');
      const agentIndex = args.indexOf('--agent');
      const newStatus = statusIndex > -1 ? args[statusIndex + 1] : null;
      const agentId = agentIndex > -1 ? args[agentIndex + 1] : 'system';
      
      const data = load('tasks.json');
      const task = data.tasks.find(t => t.id === id);
      
      if (!task) {
        console.error(`Task #${id} not found`);
        process.exit(1);
      }
      
      if (newStatus) {
        const oldStatus = task.status;
        task.status = newStatus;
        task.updatedAt = new Date().toISOString();
        save('tasks.json', data);
        
        logActivity('task_updated', agentId, `Task #${id}: ${oldStatus} → ${newStatus}`);
        
        // Update WORKING.md for assignees
        if (newStatus === 'in_progress') {
          task.assigneeIds.forEach(a => setWorking(a, id, task.title, 'in_progress'));
        } else if (newStatus === 'review') {
          task.assigneeIds.forEach(a => setWorking(a, id, task.title, 'review'));
        } else if (newStatus === 'done') {
          task.assigneeIds.forEach(a => clearWorking(a));
        }
        
        console.log(`✅ Task #${id} status: ${oldStatus} → ${newStatus}`);
      }
    },
    
    comment: (args) => {
      const id = parseInt(args[0]);
      const agentId = args[1];
      const content = args.slice(2).join(' ');
      
      if (isNaN(id) || !agentId || !content) {
        console.error('Usage: mc task comment <id> <agentId> "Comment text"');
        process.exit(1);
      }
      
      const data = load('tasks.json');
      const task = data.tasks.find(t => t.id === id);
      
      if (!task) {
        console.error(`Task #${id} not found`);
        process.exit(1);
      }
      
      task.comments.push({
        agentId,
        content,
        timestamp: new Date().toISOString()
      });
      task.updatedAt = new Date().toISOString();
      save('tasks.json', data);
      
      logActivity('comment_added', agentId, `Comment on #${id}: "${content.slice(0, 50)}..."`);
      
      // Parse @mentions
      const mentions = content.match(/@(\w+)/g) || [];
      mentions.forEach(mention => {
        const mentionedAgent = mention.slice(1);
        if (mentionedAgent === 'all') {
          const agents = load('agents.json').agents;
          agents.forEach(a => {
            if (a.id !== agentId) {
              createNotification(a.id, `@${agentId} on #${id}: ${content.slice(0, 100)}`, agentId);
            }
          });
        } else if (mentionedAgent !== agentId) {
          createNotification(mentionedAgent, `@${agentId} mentioned you on #${id}: "${content.slice(0, 100)}"`, agentId);
        }
      });
      
      // Notify subscribers (assignees)
      task.assigneeIds.forEach(assignee => {
        if (assignee !== agentId && !mentions.includes(`@${assignee}`)) {
          createNotification(assignee, `💬 New comment on #${id} from @${agentId}`, agentId);
        }
      });
      
      console.log(`✅ Comment added to task #${id}`);
    },
    
    assign: (args) => {
      const id = parseInt(args[0]);
      const agents = args[1]?.split(',') || [];
      
      if (isNaN(id) || agents.length === 0) {
        console.error('Usage: mc task assign <id> agent1,agent2');
        process.exit(1);
      }
      
      const data = load('tasks.json');
      const task = data.tasks.find(t => t.id === id);
      
      if (!task) {
        console.error(`Task #${id} not found`);
        process.exit(1);
      }
      
      const newAssignees = agents.filter(a => !task.assigneeIds.includes(a));
      task.assigneeIds = [...new Set([...task.assigneeIds, ...agents])];
      task.status = task.status === 'inbox' ? 'assigned' : task.status;
      task.updatedAt = new Date().toISOString();
      save('tasks.json', data);
      
      newAssignees.forEach(a => {
        createNotification(a, `📋 You've been assigned to #${id}: ${task.title}`);
      });
      
      logActivity('task_assigned', 'system', `#${id} assigned to ${agents.join(', ')}`);
      console.log(`✅ Task #${id} assigned to: ${task.assigneeIds.join(', ')}`);
    }
  },
  
  doc: {
    create: (args) => {
      const title = args[0];
      if (!title) {
        console.error('Usage: mc doc create "Title" --type deliverable|research|protocol [--task <id>] [--content "..."]');
        process.exit(1);
      }
      
      const typeIndex = args.indexOf('--type');
      const taskIndex = args.indexOf('--task');
      const contentIndex = args.indexOf('--content');
      const agentIndex = args.indexOf('--agent');
      
      const type = typeIndex > -1 ? args[typeIndex + 1] : 'deliverable';
      const taskId = taskIndex > -1 ? parseInt(args[taskIndex + 1]) : null;
      const content = contentIndex > -1 ? args[contentIndex + 1] : '';
      const agentId = agentIndex > -1 ? args[agentIndex + 1] : 'system';
      
      const data = load('documents.json');
      const doc = {
        id: data.nextId++,
        title,
        type,
        taskId,
        content,
        createdBy: agentId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.documents.push(doc);
      save('documents.json', data);
      
      // Link to task if specified
      if (taskId) {
        const tasks = load('tasks.json');
        const task = tasks.tasks.find(t => t.id === taskId);
        if (task) {
          task.documents = task.documents || [];
          task.documents.push(doc.id);
          save('tasks.json', tasks);
        }
      }
      
      logActivity('doc_created', agentId, `📄 Created: ${title} (${type})`);
      console.log(`✅ Created document #${doc.id}: ${title}`);
    },
    
    list: (args) => {
      const typeIndex = args.indexOf('--type');
      const taskIndex = args.indexOf('--task');
      
      const filterType = typeIndex > -1 ? args[typeIndex + 1] : null;
      const filterTask = taskIndex > -1 ? parseInt(args[taskIndex + 1]) : null;
      
      const data = load('documents.json');
      let docs = data.documents || [];
      
      if (filterType) docs = docs.filter(d => d.type === filterType);
      if (filterTask) docs = docs.filter(d => d.taskId === filterTask);
      
      if (docs.length === 0) {
        console.log('No documents found.');
        return;
      }
      
      const typeEmoji = {
        deliverable: '📦',
        research: '🔍',
        protocol: '📋',
        audit: '🛡️'
      };
      
      docs.forEach(d => {
        const emoji = typeEmoji[d.type] || '📄';
        const taskRef = d.taskId ? ` (task #${d.taskId})` : '';
        console.log(`${emoji} #${d.id} ${d.title}${taskRef}`);
      });
    },
    
    view: (args) => {
      const id = parseInt(args[0]);
      if (isNaN(id)) {
        console.error('Usage: mc doc view <id>');
        process.exit(1);
      }
      
      const data = load('documents.json');
      const doc = data.documents.find(d => d.id === id);
      
      if (!doc) {
        console.error(`Document #${id} not found`);
        process.exit(1);
      }
      
      console.log(`\n📄 Document #${doc.id}: ${doc.title}`);
      console.log(`${'─'.repeat(50)}`);
      console.log(`Type: ${doc.type}`);
      console.log(`Created by: ${doc.createdBy}`);
      console.log(`Created: ${doc.createdAt}`);
      if (doc.taskId) console.log(`Task: #${doc.taskId}`);
      if (doc.content) {
        console.log(`\nContent:\n${doc.content}`);
      }
      console.log('');
    }
  },
  
  working: (args) => {
    const agentId = args[0];
    if (!agentId) {
      console.error('Usage: mc working <agentId> [--set "task description"]');
      process.exit(1);
    }
    
    const setIndex = args.indexOf('--set');
    if (setIndex > -1) {
      const desc = args.slice(setIndex + 1).join(' ');
      const workingPath = getWorkingPath(agentId);
      const agentDir = path.dirname(workingPath);
      if (!fs.existsSync(agentDir)) {
        fs.mkdirSync(agentDir, { recursive: true });
      }
      const content = `# WORKING.md — ${agentId}

## Current Task
${desc}

## Status
🔄 IN PROGRESS

## Updated
${new Date().toISOString()}

## Notes
<!-- Add notes here -->
`;
      fs.writeFileSync(workingPath, content);
      console.log(`✅ Updated WORKING.md for @${agentId}`);
    } else {
      const working = getWorking(agentId);
      if (working) {
        console.log(working);
      } else {
        console.log(`No WORKING.md found for @${agentId}`);
      }
    }
  },
  
  notify: (args) => {
    const agent = args[0]?.replace('@', '');
    const message = args.slice(1).join(' ');
    
    if (!agent || !message) {
      console.error('Usage: mc notify @agent "message"');
      process.exit(1);
    }
    
    if (agent === 'all') {
      const agents = load('agents.json').agents;
      agents.forEach(a => createNotification(a.id, message));
      console.log(`✅ Notified all ${agents.length} agents`);
    } else {
      createNotification(agent, message);
      console.log(`✅ Notification queued for @${agent}`);
    }
  },
  
  activity: (args) => {
    const limitIndex = args.indexOf('--limit');
    const limit = limitIndex > -1 ? parseInt(args[limitIndex + 1]) : 10;
    
    const data = load('activity.json');
    const activities = data.activities.slice(-limit).reverse();
    
    if (activities.length === 0) {
      console.log('No activity yet.');
      return;
    }
    
    console.log('\n📊 Recent Activity:\n');
    activities.forEach(a => {
      const time = new Date(a.timestamp).toLocaleTimeString();
      console.log(`  [${time}] @${a.agentId}: ${a.message}`);
    });
    console.log('');
  },
  
  agents: () => {
    const data = load('agents.json');
    
    console.log('\n🤖 Squad Status:\n');
    data.agents.forEach(a => {
      const statusEmoji = a.status === 'active' ? '🟢' : a.status === 'blocked' ? '🔴' : '⚪';
      console.log(`  ${statusEmoji} ${a.name} (@${a.id}) - ${a.role}`);
      console.log(`     Session: ${a.sessionKey}`);
      console.log(`     Tools: ${a.tools?.join(', ') || 'default'}`);
    });
    console.log('');
  },
  
  standup: () => {
    const tasks = load('tasks.json').tasks;
    const agents = load('agents.json').agents;
    const activities = load('activity.json').activities;
    
    const today = new Date().toISOString().slice(0, 10);
    const todayActivities = activities.filter(a => a.timestamp.startsWith(today));
    
    console.log(`\n📊 DAILY STANDUP — ${today}\n`);
    
    const done = tasks.filter(t => t.status === 'done' && t.updatedAt.startsWith(today));
    if (done.length > 0) {
      console.log('✅ COMPLETED TODAY');
      done.forEach(t => console.log(`  • ${t.assigneeIds.join(', ') || 'Unassigned'}: ${t.title}`));
      console.log('');
    }
    
    const inProgress = tasks.filter(t => t.status === 'in_progress');
    if (inProgress.length > 0) {
      console.log('🔄 IN PROGRESS');
      inProgress.forEach(t => console.log(`  • ${t.assigneeIds.join(', ')}: ${t.title}`));
      console.log('');
    }
    
    const blocked = tasks.filter(t => t.status === 'blocked');
    if (blocked.length > 0) {
      console.log('🚫 BLOCKED');
      blocked.forEach(t => console.log(`  • ${t.assigneeIds.join(', ')}: ${t.title}`));
      console.log('');
    }
    
    const review = tasks.filter(t => t.status === 'review');
    if (review.length > 0) {
      console.log('👀 NEEDS REVIEW');
      review.forEach(t => console.log(`  • ${t.title}`));
      console.log('');
    }
    
    const inbox = tasks.filter(t => t.status === 'inbox');
    if (inbox.length > 0) {
      console.log('📥 INBOX (Unassigned)');
      inbox.forEach(t => console.log(`  • ${t.title}`));
      console.log('');
    }
    
    console.log('🤖 AGENT STATUS');
    agents.forEach(a => {
      const statusEmoji = a.status === 'active' ? '🟢' : a.status === 'blocked' ? '🔴' : '⚪';
      const working = getWorking(a.id);
      let workingOn = '';
      if (working) {
        const match = working.match(/\*\*Task #(\d+)\*\*: (.+)/);
        if (match) workingOn = ` → #${match[1]}`;
      }
      console.log(`  ${statusEmoji} ${a.name} (${a.role})${workingOn}`);
    });
    console.log('');
  },
  
  check: (args) => {
    const agentId = args[0];
    if (!agentId) {
      console.error('Usage: mc check <agentId>');
      process.exit(1);
    }
    
    const notifications = load('notifications.json');
    const tasks = load('tasks.json');
    
    const pending = notifications.notifications.filter(n => 
      n.mentionedAgentId === agentId && !n.delivered
    );
    
    const assigned = tasks.tasks.filter(t => 
      t.assigneeIds.includes(agentId) && 
      ['assigned', 'in_progress', 'review'].includes(t.status)
    );
    
    const working = getWorking(agentId);
    
    if (pending.length === 0 && assigned.length === 0) {
      console.log('HEARTBEAT_OK');
      return;
    }
    
    console.log(`\n📬 MISSION CONTROL CHECK — @${agentId}\n`);
    
    if (working) {
      const match = working.match(/## Current Task\n(.+)/);
      if (match && !match[1].includes('None')) {
        console.log(`📍 Currently working on: ${match[1]}\n`);
      }
    }
    
    if (pending.length > 0) {
      console.log('🔔 Notifications:');
      pending.forEach(n => {
        console.log(`  • ${n.content}`);
        n.delivered = true;
      });
      save('notifications.json', notifications);
      console.log('');
    }
    
    if (assigned.length > 0) {
      console.log('📋 Your Tasks:');
      const statusEmoji = { assigned: '👤', in_progress: '🔄', review: '👀' };
      assigned.forEach(t => {
        console.log(`  ${statusEmoji[t.status]} #${t.id} ${t.title} (${t.status})`);
      });
      console.log('');
    }
  }
};

// Parse and run
const [,, cmd, subcmd, ...args] = process.argv;

if (!cmd) {
  console.log(`
Mission Control CLI v0.2 🐉

Tasks:
  mc task create "Title" [--assign agent1,agent2] [--desc "Description"]
  mc task list [--status <status>] [--assignee <agent>]
  mc task view <id>
  mc task update <id> --status <status>
  mc task comment <id> <agentId> "Comment with @mentions"
  mc task assign <id> agent1,agent2

Documents:
  mc doc create "Title" --type deliverable|research|protocol [--task <id>]
  mc doc list [--type <type>] [--task <id>]
  mc doc view <id>

Working State:
  mc working <agentId>                    # View current task
  mc working <agentId> --set "description" # Set manually

Notifications:
  mc notify @agent "message"
  mc notify @all "broadcast"

Monitoring:
  mc check <agentId>    # Agent heartbeat check
  mc standup            # Daily summary
  mc activity           # Recent activity
  mc agents             # Squad status
  `);
  process.exit(0);
}

if (cmd === 'task' && commands.task[subcmd]) {
  commands.task[subcmd](args);
} else if (cmd === 'doc' && commands.doc[subcmd]) {
  commands.doc[subcmd](args);
} else if (commands[cmd]) {
  commands[cmd]([subcmd, ...args].filter(Boolean));
} else {
  console.error(`Unknown command: ${cmd} ${subcmd || ''}`);
  process.exit(1);
}
