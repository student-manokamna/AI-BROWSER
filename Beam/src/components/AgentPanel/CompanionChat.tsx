import React, { useState, useEffect, useRef } from 'react';

interface Message {
  role: 'user' | 'companion';
  content: string;
  timestamp: Date;
}

interface CompanionChatProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CompanionChat({ isOpen, onClose }: CompanionChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // Initial greeting
      addCompanionMessage("Hello. I'm here to listen. How are you feeling today?");
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addCompanionMessage = (content: string) => {
    setMessages(prev => [...prev, { role: 'companion', content, timestamp: new Date() }]);
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }]);
    
    setIsTyping(true);

    // Simulate AI response (in a real app, this would call the AI service)
    // For now, we'll use a simple empathetic response system
    setTimeout(() => {
      const response = generateCompanionResponse(userMessage);
      addCompanionMessage(response);
      setIsTyping(false);
    }, 1000 + Math.random() * 1000);
  };

  const generateCompanionResponse = (userInput: string): string => {
    const lowerInput = userInput.toLowerCase();
    
    if (lowerInput.includes('sad') || lowerInput.includes('depressed') || lowerInput.includes('down')) {
      return "I hear that you're feeling sad. It's okay to feel this way. Would you like to talk more about what's bringing you down?";
    }
    if (lowerInput.includes('anxious') || lowerInput.includes('worried') || lowerInput.includes('stress')) {
      return "It sounds like you're feeling anxious. Take a deep breath with me. What's weighing on your mind?";
    }
    if (lowerInput.includes('angry') || lowerInput.includes('frustrated')) {
      return "I sense some anger or frustration. That's a valid emotion. What happened that's making you feel this way?";
    }
    if (lowerInput.includes('happy') || lowerInput.includes('good')) {
      return "I'm glad to hear you're feeling good! What's making you feel positive today?";
    }
    if (lowerInput.includes('lonely')) {
      return "Feeling lonely can be really hard. I'm here with you right now. What would help you feel more connected?";
    }
    if (lowerInput.includes('hopeless')) {
      return "I hear that you're feeling hopeless, and I want you to know that your feelings are valid. Even in the darkest moments, there is support available. Have you considered reaching out to a professional?";
    }
    
    // General empathetic responses
    const generalResponses = [
      "I'm here to listen. Tell me more about that.",
      "That sounds really difficult. How long have you been feeling this way?",
      "I appreciate you sharing that with me. What else is on your mind?",
      "I hear you. It's important to acknowledge these feelings.",
      "Thank you for trusting me with this. What would you like to explore next?"
    ];
    
    return generalResponses[Math.floor(Math.random() * generalResponses.length)];
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="companion-chat-overlay" onClick={onClose}>
      <div className="companion-chat-modal" onClick={e => e.stopPropagation()}>
        <div className="companion-chat-header">
          <h3>Companion</h3>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>
        
        <div className="companion-chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`message ${msg.role}`}>
              <div className="message-bubble">
                {msg.content}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="message companion">
              <div className="message-bubble typing">
                ...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        <div className="companion-chat-input">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            autoFocus
          />
          <button onClick={handleSend} disabled={!input.trim() || isTyping}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
