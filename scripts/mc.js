#!/usr/bin/env node

/**
 * Mission Control CLI
 * 
 * Usage:
 *   mc task create "Title" --assign ember,scout
 *   mc task list [--status inbox|assigned|in_progress|review|done]
 *   mc task update <id> --status <status>
 *   mc notify @agent "message"
 *   mc activity [--limit 10]
 *   mc standup
 */

const fs = require('fs');
const path = require('path');

const MC_DIR = path.join(__dirname, '..', '.mission-control');

// Load JSON file
function load(file) {
  const filepath = path.join(MC_DIR, file);
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
  // Keep last 100 activities
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
        comments: []
      };
      data.tasks.push(task);
      save('tasks.json', data);
      
      logActivity('task_created', 'system', `Task #${task.id}: ${title}`);
      
      // Notify assignees
      assignees.forEach(agentId => {
        createNotification(agentId, `You've been assigned to task #${task.id}: ${title}`);
      });
      
      console.log(`✅ Created task #${task.id}: ${title}`);
      if (assignees.length > 0) {
        console.log(`   Assigned to: ${assignees.join(', ')}`);
      }
    },
    
    list: (args) => {
      const statusIndex = args.indexOf('--status');
      const filterStatus = statusIndex > -1 ? args[statusIndex + 1] : null;
      
      const data = load('tasks.json');
      let tasks = data.tasks;
      
      if (filterStatus) {
        tasks = tasks.filter(t => t.status === filterStatus);
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
    
    update: (args) => {
      const id = parseInt(args[0]);
      if (isNaN(id)) {
        console.error('Usage: mc task update <id> --status <status>');
        process.exit(1);
      }
      
      const statusIndex = args.indexOf('--status');
      const newStatus = statusIndex > -1 ? args[statusIndex + 1] : null;
      
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
        
        logActivity('task_updated', 'system', `Task #${id} status: ${oldStatus} → ${newStatus}`);
        console.log(`✅ Task #${id} status updated to: ${newStatus}`);
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
      
      logActivity('comment_added', agentId, `Comment on task #${id}`);
      
      // Parse @mentions and notify
      const mentions = content.match(/@(\w+)/g) || [];
      mentions.forEach(mention => {
        const mentionedAgent = mention.slice(1); // Remove @
        if (mentionedAgent !== agentId) {
          createNotification(mentionedAgent, `${agentId} mentioned you on task #${id}: "${content.slice(0, 100)}..."`, agentId);
        }
      });
      
      // Notify all assignees (thread subscription)
      task.assigneeIds.forEach(assignee => {
        if (assignee !== agentId && !mentions.includes(`@${assignee}`)) {
          createNotification(assignee, `New comment on task #${id} from ${agentId}`, agentId);
        }
      });
      
      console.log(`✅ Comment added to task #${id}`);
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
      agents.forEach(a => {
        createNotification(a.id, message);
      });
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
    
    activities.forEach(a => {
      const time = new Date(a.timestamp).toLocaleString();
      console.log(`[${time}] ${a.agentId}: ${a.message}`);
    });
  },
  
  standup: () => {
    const tasks = load('tasks.json').tasks;
    const agents = load('agents.json').agents;
    const activities = load('activity.json').activities;
    
    const today = new Date().toISOString().slice(0, 10);
    const todayActivities = activities.filter(a => a.timestamp.startsWith(today));
    
    console.log(`\n📊 DAILY STANDUP — ${today}\n`);
    
    // Completed
    const done = tasks.filter(t => t.status === 'done' && t.updatedAt.startsWith(today));
    if (done.length > 0) {
      console.log('✅ COMPLETED TODAY');
      done.forEach(t => console.log(`  • ${t.assigneeIds.join(', ')}: ${t.title}`));
      console.log('');
    }
    
    // In Progress
    const inProgress = tasks.filter(t => t.status === 'in_progress');
    if (inProgress.length > 0) {
      console.log('🔄 IN PROGRESS');
      inProgress.forEach(t => console.log(`  • ${t.assigneeIds.join(', ')}: ${t.title}`));
      console.log('');
    }
    
    // Blocked
    const blocked = tasks.filter(t => t.status === 'blocked');
    if (blocked.length > 0) {
      console.log('🚫 BLOCKED');
      blocked.forEach(t => console.log(`  • ${t.assigneeIds.join(', ')}: ${t.title}`));
      console.log('');
    }
    
    // Needs Review
    const review = tasks.filter(t => t.status === 'review');
    if (review.length > 0) {
      console.log('👀 NEEDS REVIEW');
      review.forEach(t => console.log(`  • ${t.title}`));
      console.log('');
    }
    
    // Agent Status
    console.log('🤖 AGENT STATUS');
    agents.forEach(a => {
      const statusEmoji = a.status === 'active' ? '🟢' : a.status === 'blocked' ? '🔴' : '⚪';
      console.log(`  ${statusEmoji} ${a.name} (${a.role}): ${a.status}`);
    });
  },
  
  check: (args) => {
    const agentId = args[0];
    if (!agentId) {
      console.error('Usage: mc check <agentId>');
      process.exit(1);
    }
    
    const notifications = load('notifications.json');
    const tasks = load('tasks.json');
    
    // Get undelivered notifications for this agent
    const pending = notifications.notifications.filter(n => 
      n.mentionedAgentId === agentId && !n.delivered
    );
    
    // Get assigned tasks
    const assigned = tasks.tasks.filter(t => 
      t.assigneeIds.includes(agentId) && 
      ['assigned', 'in_progress'].includes(t.status)
    );
    
    if (pending.length === 0 && assigned.length === 0) {
      console.log('HEARTBEAT_OK');
      return;
    }
    
    console.log(`\n📬 NOTIFICATIONS FOR @${agentId}:\n`);
    
    if (pending.length > 0) {
      console.log('🔔 New Notifications:');
      pending.forEach(n => {
        console.log(`  • ${n.content}`);
        // Mark as delivered
        n.delivered = true;
      });
      save('notifications.json', notifications);
      console.log('');
    }
    
    if (assigned.length > 0) {
      console.log('📋 Your Tasks:');
      assigned.forEach(t => {
        console.log(`  • #${t.id} ${t.title} (${t.status})`);
      });
    }
  }
};

// Parse and run
const [,, cmd, subcmd, ...args] = process.argv;

if (!cmd) {
  console.log(`
Mission Control CLI 🐉

Usage:
  mc task create "Title" [--assign agent1,agent2] [--desc "Description"]
  mc task list [--status inbox|assigned|in_progress|review|done]
  mc task update <id> --status <status>
  mc task comment <id> <agentId> "Comment text"
  mc notify @agent "message"
  mc activity [--limit 10]
  mc standup
  mc check <agentId>
  `);
  process.exit(0);
}

if (cmd === 'task' && commands.task[subcmd]) {
  commands.task[subcmd](args);
} else if (commands[cmd]) {
  commands[cmd]([subcmd, ...args].filter(Boolean));
} else {
  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}
