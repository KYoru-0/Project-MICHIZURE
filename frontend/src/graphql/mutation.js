import { gql } from '@aws-amplify/api';

export const sendMessage = gql`
    mutation SendMessages($content: String!, $sender: String!) {
        sendMessage(content: $content, sender: $sender) {
            id
            content
            sender
            createdAt
        }
    }
`;