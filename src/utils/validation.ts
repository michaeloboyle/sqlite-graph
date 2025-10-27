import { NodeData, GraphSchema } from '../types';

/**
 * Validate node type against schema
 */
export function validateNodeType(nodeType: string, schema?: GraphSchema): void {
  if (!nodeType || typeof nodeType !== 'string') {
    throw new Error('Node type must be a non-empty string');
  }

  if (schema && schema.nodes && !schema.nodes[nodeType]) {
    throw new Error(`Node type '${nodeType}' is not defined in schema`);
  }
}

/**
 * Validate edge type against schema
 */
export function validateEdgeType(edgeType: string, schema?: GraphSchema): void {
  if (!edgeType || typeof edgeType !== 'string') {
    throw new Error('Edge type must be a non-empty string');
  }

  if (schema && schema.edges && !schema.edges[edgeType]) {
    throw new Error(`Edge type '${edgeType}' is not defined in schema`);
  }
}

/**
 * Validate node properties against schema
 */
export function validateNodeProperties(
  nodeType: string,
  properties: NodeData,
  schema?: GraphSchema
): void {
  if (!properties || typeof properties !== 'object') {
    throw new Error('Properties must be an object');
  }

  if (schema && schema.nodes && schema.nodes[nodeType]?.properties) {
    const definedProps = schema.nodes[nodeType].properties!;
    const providedProps = Object.keys(properties);

    // Check for undefined properties (optional validation)
    const undefinedProps = providedProps.filter(prop => !definedProps.includes(prop));
    if (undefinedProps.length > 0) {
      console.warn(`Warning: Node type '${nodeType}' has undefined properties: ${undefinedProps.join(', ')}`);
    }
  }
}

/**
 * Validate edge relationship against schema
 */
export function validateEdgeRelationship(
  edgeType: string,
  fromNodeType: string,
  toNodeType: string,
  schema?: GraphSchema
): void {
  if (!schema || !schema.edges || !schema.edges[edgeType]) {
    return; // Skip validation if no schema defined
  }

  const edgeDef = schema.edges[edgeType];

  if (edgeDef.from && edgeDef.from !== fromNodeType) {
    throw new Error(
      `Edge type '${edgeType}' requires 'from' node type '${edgeDef.from}', got '${fromNodeType}'`
    );
  }

  if (edgeDef.to && edgeDef.to !== toNodeType) {
    throw new Error(
      `Edge type '${edgeType}' requires 'to' node type '${edgeDef.to}', got '${toNodeType}'`
    );
  }
}

/**
 * Validate node ID
 */
export function validateNodeId(id: number): void {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Node ID must be a positive integer');
  }
}