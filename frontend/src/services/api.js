import awsConfig from '../aws-exports';

const STEP_FORMAT = 'michizure-step-v1';
export const DEFAULT_CHARACTER_PROMPT = 'Be a heartwarming, friendly companion. Be kind, patient, and genuinely interested in what the user shares. Offer encouragement and thoughtful support without being judgmental or overly sentimental. Keep the conversation natural and warm, and respect the user’s boundaries.';

const LIST_MESSAGES_QUERY = /* GraphQL */ `
  query ListMessages {
    listMessages {
      id
      content
      sender
      createdAt
    }
  }
`;

export function normalizeStoredStep(message) {
  if (!message || typeof message.content !== 'string') return null;

  let storedVariants;
  let requestId = null;
  let sessionId = null;
  let storedContent;
  try {
    storedContent = JSON.parse(message.content);
    if (storedContent?.format === STEP_FORMAT && Array.isArray(storedContent.variants)) {
      storedVariants = storedContent.variants;
      requestId = storedContent.requestId || null;
      sessionId = storedContent.sessionId || null;
    }
  } catch {
    storedVariants = null;
  }

  const variants = (storedVariants || [{
    id: message.id,
    content: message.content,
    sender: message.sender,
    createdAt: message.createdAt,
  }])
    .filter((variant) => variant && typeof variant.content === 'string')
    .map((variant) => ({
      id: variant.id || message.id,
      text: variant.content,
      senderRaw: variant.sender || message.sender || '',
      model: variant.modelId || null,
      timestamp: new Date(variant.createdAt || message.createdAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
      isoTimestamp: variant.createdAt || message.createdAt,
    }));

  if (variants.length === 0) return null;
  const firstSender = variants[0].senderRaw;

  return {
    id: message.id,
    sender: firstSender.startsWith('AI') ? 'assistant' : 'user',
    activeIndex: 0,
    variants,
    requestId,
    sessionId,
  };
}

export function getStoredPath() {
  const value = localStorage.getItem('michizure_history_until');
  if (!value) return null;
  try {
    const path = JSON.parse(value);
    return Array.isArray(path) ? path.map(String) : null;
  } catch {
    return null;
  }
}

/**
 * Fetch messages for the current session from DynamoDB via AppSync.
 * Filters by sessionId and historyUntil stored in localStorage.
 */
export async function fetchSessionMessages() {
  const sessionId = localStorage.getItem('michizure_session_id');
  const historyUntil = localStorage.getItem('michizure_history_until');

  const response = await fetch(awsConfig.aws_appsync_graphqlEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': awsConfig.aws_appsync_apiKey,
    },
    body: JSON.stringify({ query: LIST_MESSAGES_QUERY }),
  });

  if (!response.ok) {
    throw new Error(`Failed to load chat history (HTTP ${response.status}).`);
  }
  const result = await response.json();
  if (result.errors?.length > 0) {
    throw new Error(result.errors.map((e) => e.message).join(', '));
  }
  if (!Array.isArray(result.data?.listMessages)) {
    throw new Error('AppSync did not return the chat history.');
  }

  let msgs = result.data.listMessages;

  msgs = msgs.filter((message) => normalizeStoredStep(message)?.sessionId === sessionId);
  const storedPath = getStoredPath();
  if (!storedPath && historyUntil) msgs = msgs.filter((m) => m.createdAt <= historyUntil);

  return msgs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

/**
 * Request the backend to permanently delete all messages from DynamoDB.
 */
export async function deleteAllTableMessages() {
  const response = await fetch(awsConfig.aws_appsync_graphqlEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': awsConfig.aws_appsync_apiKey,
    },
    body: JSON.stringify({
      query: SEND_MESSAGE_MUTATION,
      variables: {
        content: '',
        sender: 'system:clear',
        sessionId: localStorage.getItem('michizure_session_id'),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to delete chat history (HTTP ${response.status}).`);
  }
  const result = await response.json();
  if (result.errors?.length > 0) {
    throw new Error(result.errors.map((e) => e.message).join(', '));
  }

  const message = result.data?.sendMessage;
  if (!message) throw new Error('AppSync did not confirm chat history deletion.');
  return message;
}

export const SEND_MESSAGE_MUTATION = /* GraphQL */ `
  mutation SendMessage(
    $content: String!, $sender: String!, $apiKey: String, $model: String,
    $instruction: String, $sessionId: String!, $historyUntil: String
  ) {
    sendMessage(
      content: $content, sender: $sender, apiKey: $apiKey, model: $model,
      instruction: $instruction, sessionId: $sessionId, historyUntil: $historyUntil
    ) {
      id
      content
      sender
      createdAt
    }
  }
`;

const ON_SEND_MESSAGE_SUBSCRIPTION = /* GraphQL */ `
  subscription OnSendMessage {
    onSendMessage {
      id
      content
      sender
      createdAt
    }
  }
`;

/**
 * Subscribe to incoming messages via AppSync real-time WebSocket.
 * @param {(msg: {id, content, sender, createdAt}) => void} onMessage
 * @returns {() => void} unsubscribe / cleanup function
 */
export function subscribeToMessages(onMessage) {
  const endpoint = awsConfig.aws_appsync_graphqlEndpoint;
  const apiKey = awsConfig.aws_appsync_apiKey;
  const host = new URL(endpoint).hostname;

  const realtimeEndpoint = endpoint
    .replace('https://', 'wss://')
    .replace('appsync-api', 'appsync-realtime-api');

  const header = btoa(JSON.stringify({ 'x-api-key': apiKey, host }));
  const payload = btoa(JSON.stringify({}));
  const wsUrl = `${realtimeEndpoint}?header=${header}&payload=${payload}`;

  const ws = new WebSocket(wsUrl, 'graphql-ws');
  const subscriptionId = crypto.randomUUID();

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'connection_init' }));
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'connection_ack') {
      ws.send(JSON.stringify({
        id: subscriptionId,
        type: 'start',
        payload: {
          data: JSON.stringify({
            query: ON_SEND_MESSAGE_SUBSCRIPTION,
            variables: {},
          }),
          extensions: {
            authorization: {
              'x-api-key': apiKey,
              host,
            },
          },
        },
      }));
    } else if (msg.type === 'data' && msg.id === subscriptionId) {
      const incoming = msg.payload?.data?.onSendMessage;
      if (incoming) onMessage(incoming);
    }
  };

  return () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ id: subscriptionId, type: 'stop' }));
    }
    ws.close();
  };
}

export async function verifyOpenRouterKeyAndFetchModels(apiKey) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const keyResponse = await fetch('https://openrouter.ai/api/v1/key', { headers });
  const keyResult = await keyResponse.json();
  if (!keyResponse.ok || !keyResult.data) {
    throw new Error(keyResult.error?.message || 'OpenRouter rejected this API key.');
  }

  const modelsResponse = await fetch(
    'https://openrouter.ai/api/v1/models?output_modalities=text',
    { headers }
  );
  const modelsResult = await modelsResponse.json();
  if (!modelsResponse.ok || !Array.isArray(modelsResult.data)) {
    throw new Error(modelsResult.error?.message || 'Unable to load OpenRouter models.');
  }

  const models = modelsResult.data
    .filter((model) => model && typeof model.id === 'string')
    .map((model) => ({ id: model.id, name: model.name || model.id }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  if (models.length === 0) {
    throw new Error('OpenRouter returned no text models.');
  }
  return models;
}

export async function sendAppSyncMessage({ content, sender = 'user', apiKey, model, historyUntil }) {
  const instruction = localStorage.getItem('michizure_character_prompt') || DEFAULT_CHARACTER_PROMPT;
  const sessionId = localStorage.getItem('michizure_session_id');
  if (!sessionId) throw new Error('No active chat session ID is available.');

  const response = await fetch(awsConfig.aws_appsync_graphqlEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': awsConfig.aws_appsync_apiKey,
    },
    body: JSON.stringify({
      query: SEND_MESSAGE_MUTATION,
      variables: {
        content,
        sender,
        apiKey: apiKey || null,
        model: model || null,
        instruction,
        sessionId,
        historyUntil: historyUntil || null,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send chat message (HTTP ${response.status}).`);
  }
  const result = await response.json();
  if (result.errors && result.errors.length > 0) {
    throw new Error(result.errors.map((e) => e.message).join(', '));
  }

  const message = result.data?.sendMessage;
  if (!message) throw new Error('AppSync did not return a chat message.');
  return message;
}
