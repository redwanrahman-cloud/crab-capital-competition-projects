// SYNTHETIC LOCAL DOM ADAPTER. Not an Atlassian UI Kit renderer.
// Only the separate preview build aliases @forge/react to this module.
import React from 'react';import {createRoot} from 'react-dom/client';
export const Button=({isDisabled,onClick,children})=><button disabled={isDisabled} onClick={onClick}>{children}</button>;
export const Text=({children})=><p>{children}</p>;
export const Stack=({children})=><section className="stack">{children}</section>;
export const Heading=({as:Tag='h2',children})=><Tag>{children}</Tag>;
export default {render:element=>createRoot(document.getElementById('app')).render(element)};
