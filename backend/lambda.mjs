import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, ScanCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = "MICHIZURE-Messages";

const BASE_SYSTEM_PROMPT = `You are Michizure, an AI companion in Project-MICHIZURE.
When describing your own actions, gestures, expressions, or other nonverbal behavior, enclose each action in a single pair of asterisks (for example, *smiles*). Keep spoken dialogue outside the asterisks, and do not use asterisks for emphasis.
If the user sends an action without any explicit object, assume the action is directed toward you and respond accordingly`;

const STEP_FORMAT = "michizure-step-v1";

function getStepVariants(item) {
    try {
        const stored = JSON.parse(item.content);
        if (stored?.format === STEP_FORMAT && Array.isArray(stored.variants)) {
            return stored.variants;
        }
    } catch {
        // Existing rows store a single message as plain text.
    }

    return [{
        id: item.id,
        content: item.content,
        sender: item.sender,
        createdAt: item.createdAt,
    }];
}

function getStepMetadata(item) {
    try {
        const stored = JSON.parse(item.content);
        if (stored?.format === STEP_FORMAT && Array.isArray(stored.variants)) {
            return {
                requestId: stored.requestId || null,
                sessionId: stored.sessionId || null,
            };
        }
    } catch {
        // Existing rows store a single message as plain text.
    }

    return null;
}

function belongsToSession(item, sessionId) {
    return getStepMetadata(item)?.sessionId === sessionId;
}

function makeStep(id, variants, createdAt, requestId, sessionId) {
    const latestVariant = variants[variants.length - 1];
    return {
        id,
        content: JSON.stringify({ format: STEP_FORMAT, requestId, sessionId, variants }),
        sender: latestVariant.sender,
        createdAt,
    };
}

async function scanAllItems(projectionExpression) {
    const items = [];
    let exclusiveStartKey;

    do {
        const page = await ddb.send(new ScanCommand({
            TableName: TABLE_NAME,
            ConsistentRead: true,
            ...(projectionExpression ? { ProjectionExpression: projectionExpression } : {}),
            ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
        }));
        items.push(...(page.Items || []));
        exclusiveStartKey = page.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return items;
}

async function batchWriteItems(requests) {
    let pending = requests;
    let attempt = 0;

    while (pending.length > 0) {
        const result = await ddb.send(new BatchWriteCommand({
            RequestItems: { [TABLE_NAME]: pending },
        }));
        pending = result.UnprocessedItems?.[TABLE_NAME] || [];
        if (pending.length > 0) {
            if (attempt >= 5) {
                throw new Error(`DynamoDB left ${pending.length} batch writes unprocessed.`);
            }
            await new Promise((resolve) => setTimeout(resolve, 50 * (2 ** attempt)));
            attempt += 1;
        }
    }
}

export const handler = async (event) => {
    try {
        const { content, sender, apiKey, model, instruction, sessionId, historyUntil } = event.arguments || {};

        if (sender === "system:clear") {
            const items = await scanAllItems("id");
            for (let i = 0; i < items.length; i += 25) {
                const chunk = items.slice(i, i + 25);
                const deleteRequests = chunk.map((item) => ({
                    DeleteRequest: { Key: { id: item.id } },
                }));
                await batchWriteItems(deleteRequests);
            }
            return {
                id: crypto.randomUUID(),
                content: "TABLE_CLEARED",
                sender: "system",
                createdAt: new Date().toISOString(),
            };
        }

        if (typeof sender !== "string" || !sender) {
            throw new Error("Missing sender in event.arguments");
        }
        if (typeof sessionId !== "string" || !sessionId.trim()) {
            throw new Error("Missing sessionId in event.arguments");
        }
        if (apiKey && (typeof model !== "string" || !model.trim())) {
            throw new Error("Missing model in event.arguments");
        }

        const isEmptyChat = !content || content.trim() === "" || content === "__EMPTY__";
        const regenerateMatch = sender.match(/^system:regenerate:(.+)$/);
        const userStepMatch = sender.match(/^system:user:(.+)$/);
        const continueMatch = sender.match(/^system:continue:(.+)$/);
        const isRegeneration = Boolean(regenerateMatch) || sender === "system:regenerate";
        const isContinue = Boolean(continueMatch) || sender === "system:continue";
        const isAssistantMessage = typeof sender === "string" && sender.startsWith("AI");
        const isUserMessage = !isEmptyChat && !isRegeneration && !isContinue && !isAssistantMessage;
        const regenerationStepId = regenerateMatch?.[1];
        const userStepId = userStepMatch?.[1] || (isUserMessage ? crypto.randomUUID() : null);
        const requestId = regenerationStepId || userStepId || continueMatch?.[1] || null;
        const now = new Date().toISOString();
        const userStep = isUserMessage
            ? makeStep(userStepId, [{
                id: userStepId,
                content,
                sender: userStepMatch ? "user" : sender,
                createdAt: now,
            }], now, userStepId, sessionId)
            : null;

        if (!apiKey) {
            if (userStep) {
                await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: userStep }));
                return userStep;
            }
            if (!isRegeneration && !isContinue && content) {
                const introId = crypto.randomUUID();
                const introStep = makeStep(introId, [{
                    id: introId,
                    content,
                    sender,
                    createdAt: now,
                }], now, null, sessionId);
                await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: introStep }));
                return introStep;
            }
            return {
                id: regenerationStepId || crypto.randomUUID(),
                content: "",
                sender: "system:no-response",
                createdAt: now,
            };
        }

        const allItems = await scanAllItems();

        let chosenIdSet = null;
        if (historyUntil && historyUntil.startsWith("[")) {
            try {
                const parsedIds = JSON.parse(historyUntil);
                if (Array.isArray(parsedIds)) {
                    chosenIdSet = new Set(parsedIds.map(String));
                }
            } catch {
                chosenIdSet = null;
            }
        }

        const cutoffTimestamp = !chosenIdSet && historyUntil && !historyUntil.startsWith("[")
            ? historyUntil
            : null;
        const history = allItems
            .filter((m) => {
                if (!belongsToSession(m, sessionId)) return false;
                if (cutoffTimestamp && m.createdAt > cutoffTimestamp) return false;
                return true;
            })
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            .map((step) => {
                const variants = getStepVariants(step);
                const selectedVariant = chosenIdSet
                    ? variants.find((variant) => chosenIdSet.has(variant.id))
                    : variants[variants.length - 1];
                if (!selectedVariant || !selectedVariant.content || selectedVariant.content === "__EMPTY__") {
                    return null;
                }
                const selectedSender = selectedVariant.sender || "";
                return {
                    role: selectedSender.startsWith("AI") ? "assistant" : "user",
                    content: selectedVariant.content,
                };
            })
            .filter(Boolean)
            .slice(-10);

        if (userStep) await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: userStep }));

        const userInstruction = instruction?.trim()
            ? `\n\n[Custom Character Instructions]:\n${instruction.trim()}`
            : "";
        const systemPrompt = `${BASE_SYSTEM_PROMPT}${userInstruction}`;

        const openRouterMessages = [
            { role: "system", content: systemPrompt },
            ...history,
        ];
        if (!isEmptyChat && (!isRegeneration || sender === "system:regenerate")) {
            openRouterMessages.push({ role: "user", content: content });
        }

        const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                messages: openRouterMessages,
            }),
        });

        if (!openRouterRes.ok) {
            throw new Error(`OpenRouter request failed with status ${openRouterRes.status}.`);
        }
        const aiData = await openRouterRes.json();
        if (aiData.error) {
            throw new Error(`OpenRouter Error: ${aiData.error.message || "Unknown API error"}`);
        }
        const actualModel = aiData.model;
        if (typeof actualModel !== "string" || !actualModel.trim()) {
            throw new Error("OpenRouter response did not include the model identifier.");
        }

        const responseText = aiData.choices?.[0]?.message?.content;
        const aiText = typeof responseText === "string" && responseText.trim()
            ? responseText.trim()
            : "Sorry, I couldn't generate a response.";

        const aiVariant = {
            id: crypto.randomUUID(),
            content: aiText,
            modelId: actualModel,
            sender: `AI (${actualModel.split("/").pop()})`,
            createdAt: new Date().toISOString(),
        };

        if (regenerationStepId) {
            const targetStep = allItems.find((step) => step.id === regenerationStepId);
            if (!targetStep || !belongsToSession(targetStep, sessionId)) {
                throw new Error("Cannot regenerate a message whose step was not found.");
            }
            const updatedStep = makeStep(
                targetStep.id,
                [...getStepVariants(targetStep), aiVariant],
                targetStep.createdAt,
                requestId,
                sessionId
            );
            await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: updatedStep }));
            return updatedStep;
        }

        const aiStep = makeStep(crypto.randomUUID(), [aiVariant], aiVariant.createdAt, requestId, sessionId);
        await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: aiStep }));
        return aiStep;

    } catch (error) {
        throw error;
    }
};
