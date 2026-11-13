import { gql } from '@aws-amplify/api';

export const onSendMessage = gql`
    subscription OnSendMessage {
        onSendMessage {
            id
            content
            sender
            createdAt
        }
    }
`;