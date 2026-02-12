
export interface AgentMessage {
  id: string;
  from: string;
  to: string; // 'all', 'Master', or specific role name
  content: string;
  timestamp: number;
  readBy: string[];
}

class AgentMessageBus {
  private messages: AgentMessage[] = [];

  postMessage(from: string, to: string, content: string) {
    this.messages.push({
      id: Date.now().toString() + Math.random(),
      from,
      to,
      content,
      timestamp: Date.now(),
      readBy: [from] // Sender has read their own message
    });
  }

  getUnreadMessages(recipient: string): AgentMessage[] {
    // specific messages for recipient OR broadcast messages, excluding ones already read
    return this.messages.filter(msg => 
      (msg.to === recipient || msg.to === 'all') && 
      !msg.readBy.includes(recipient)
    );
  }

  markAsRead(msgIds: string[], reader: string) {
    this.messages.forEach(msg => {
      if (msgIds.includes(msg.id)) {
        if (!msg.readBy.includes(reader)) {
          msg.readBy.push(reader);
        }
      }
    });
  }

  getAllMessages(): AgentMessage[] {
    return this.messages;
  }
  
  clear() {
      this.messages = [];
  }
}

export const agentBus = new AgentMessageBus();
