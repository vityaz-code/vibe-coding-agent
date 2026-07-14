import React, { useState } from 'react';

interface AITabProps {
  projectId: string;
  onSendChatMessage: (msg: string) => Promise<{ answer: string; suggestedTools?: any[] }>;
  onExecuteTool: (tool: string, args: any) => Promise<any>;
}

export const AITab: React.FC<AITabProps> = ({ onSendChatMessage, onExecuteTool }) => {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([
    { role: 'assistant', content: 'Hi! I am your AI Builder assistant (deterministic mock mode). Describe your booking application to get started.' }
  ]);
  const [inputMsg, setInputMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestedTools, setSuggestedTools] = useState<any[]>([]);

  // Simple questionnaire state
  const [slotDuration, setSlotDuration] = useState('30min');
  const [emailNotif, setEmailNotif] = useState('yes');
  const [paymentRequired, setPaymentRequired] = useState('no');
  const [surveySubmitted, setSurveySubmitted] = useState(false);

  const handleSend = async () => {
    if (!inputMsg.trim()) return;
    const userText = inputMsg;
    setInputMsg('');
    setMessages(prev => [...prev, { role: 'user', content: userText }]);
    setLoading(true);

    try {
      const res = await onSendChatMessage(userText);
      setMessages(prev => [...prev, { role: 'assistant', content: res.answer }]);
      if (res.suggestedTools) {
        setSuggestedTools(res.suggestedTools);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Fault error: ' + err.message }]);
    } finally {
      setLoading(false);
    }
  };

  const runSuggestedTool = async (tool: string, args: any) => {
    try {
      setLoading(true);
      const res = await onExecuteTool(tool, args);
      setMessages(prev => [...prev, { role: 'assistant', content: `🔧 Executed tool "${tool}": ${res.message || 'success'}` }]);
      setSuggestedTools(prev => prev.filter(t => t.tool !== tool));
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ Tool "${tool}" failed: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const submitSurvey = async () => {
    setSurveySubmitted(true);
    const configAnswer = `Slot: ${slotDuration}, Email Notifications: ${emailNotif}, Payments: ${paymentRequired}`;
    setMessages(prev => [...prev, { role: 'user', content: `Submitted booking questionnaire: ${configAnswer}` }]);
    setLoading(true);
    try {
      // 1. Add the booking module first
      const bookingRes = await onExecuteTool('addModule', { moduleId: 'booking' });
      if (!bookingRes || !bookingRes.success) {
        throw new Error(bookingRes?.message || 'Failed to add booking module.');
      }

      const bookingInstanceId = bookingRes.data?.instanceId;
      if (!bookingInstanceId) {
        throw new Error('No instance ID returned for booking module.');
      }

      // 2. Configure the newly added booking module instance
      await onExecuteTool('updateModuleConfig', {
        instanceId: bookingInstanceId,
        config: {
          slot_duration: slotDuration,
          notifications_enabled: emailNotif === 'yes',
          payments_enabled: paymentRequired === 'yes'
        }
      });
      setMessages(prev => [...prev, { role: 'assistant', content: '✓ Saved questionnaire settings to Booking scheduler configuration! Connecting modules...' }]);

      // 3. Add other certified modules required
      await onExecuteTool('addModule', { moduleId: 'auth' });
      await onExecuteTool('addModule', { moduleId: 'users' });
      await onExecuteTool('addModule', { moduleId: 'notifications' });

      // 4. Validate and resolve layout, compile, run verification tests and initiate live preview
      await onExecuteTool('validateProject', {});
      await onExecuteTool('runTests', {});
      await onExecuteTool('createPreview', {});

      setMessages(prev => [...prev, { role: 'assistant', content: '🎉 Vertical slice complete! Modules resolved, test suite completed, and interactive sandbox preview is active.' }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: '❌ Flow failed: ' + err.message }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '15px', height: '100%' }}>
      {/* Questionnaire Form */}
      <div style={{ width: '240px', borderRight: '1px solid #243547', paddingRight: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h5 style={{ margin: 0, color: '#2481cc', fontSize: '12px' }}>📋 STRUCTURED QUESTIONNAIRE</h5>
        <div style={{ fontSize: '11px', color: '#708499' }}>Answer Booking scheduler specs:</div>

        <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Slot Duration:</label>
        <select
          value={slotDuration}
          onChange={(e) => setSlotDuration(e.target.value)}
          style={{ background: '#202b36', color: '#fff', border: '1px solid #2c3c4e', padding: '4px', borderRadius: '4px', fontSize: '11px' }}
        >
          <option value="15min">15 Minutes</option>
          <option value="30min">30 Minutes</option>
          <option value="60min">60 Minutes</option>
        </select>

        <label style={{ fontSize: '11px', fontWeight: 'bold' }}>SMS/Email Confirmations:</label>
        <select
          value={emailNotif}
          onChange={(e) => setEmailNotif(e.target.value)}
          style={{ background: '#202b36', color: '#fff', border: '1px solid #2c3c4e', padding: '4px', borderRadius: '4px', fontSize: '11px' }}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>

        <label style={{ fontSize: '11px', fontWeight: 'bold' }}>Lock Payments:</label>
        <select
          value={paymentRequired}
          onChange={(e) => setPaymentRequired(e.target.value)}
          style={{ background: '#202b36', color: '#fff', border: '1px solid #2c3c4e', padding: '4px', borderRadius: '4px', fontSize: '11px' }}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>

        <button
          onClick={submitSurvey}
          disabled={surveySubmitted || loading}
          style={{
            background: '#10b981',
            color: '#fff',
            border: 'none',
            padding: '8px',
            borderRadius: '4px',
            fontWeight: 'bold',
            cursor: (surveySubmitted || loading) ? 'default' : 'pointer',
            fontSize: '11px',
            marginTop: '5px'
          }}
        >
          {surveySubmitted ? 'Submitted✓' : 'Submit & Build'}
        </button>
      </div>

      {/* Main Conversational block */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #243547', borderRadius: '6px', background: '#101921', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '130px' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', background: m.role === 'user' ? '#2481cc' : '#1e2d3e', color: '#fff', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', maxWidth: '85%' }}>
              {m.content}
            </div>
          ))}
          {loading && <div style={{ fontSize: '11px', color: '#708499' }}>AI planning & validation in progress...</div>}
        </div>

        {/* Suggested AI tool runners */}
        {suggestedTools.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: '#708499' }}>Suggested tools:</span>
            {suggestedTools.map((t, idx) => (
              <button
                key={idx}
                onClick={() => runSuggestedTool(t.tool, t.arguments)}
                style={{ background: '#3b82f633', color: '#3b82f6', border: '1px solid #3b82f6', padding: '2px 8px', borderRadius: '12px', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold' }}
              >
                {t.tool}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Describe your booking workspace request (e.g., 'build booking calendar')"
            style={{ flex: 1, background: '#202b36', color: '#fff', border: '1px solid #2c3c4e', borderRadius: '4px', padding: '8px', fontSize: '12px' }}
          />
          <button
            onClick={handleSend}
            style={{ background: '#2481cc', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
