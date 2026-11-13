import { gql } from '@aws-amplify/api';

export const listMessages = gql`
    query ListMessages {
        listMessages {
            id
            content
            sender
            createdAt
        }
    }
`;