/**
 * Comprehensive tests for validation utilities
 *
 * Target coverage for src/utils/validation.ts:
 * - Line 25: Edge schema validation
 * - Line 38: Properties type validation
 * - Line 48: Undefined properties warning
 * - Lines 62-75: validateEdgeRelationship function
 */

import {
  validateNodeType,
  validateEdgeType,
  validateNodeProperties,
  validateEdgeRelationship,
  validateNodeId
} from '../../src/utils/validation';
import { GraphSchema } from '../../src/types';

describe('Validation Utilities', () => {
  describe('validateNodeType', () => {
    it('should accept valid node type without schema', () => {
      expect(() => validateNodeType('Person')).not.toThrow();
      expect(() => validateNodeType('Job')).not.toThrow();
    });

    it('should throw on empty node type', () => {
      expect(() => validateNodeType('')).toThrow('Node type must be a non-empty string');
    });

    it('should throw on non-string node type', () => {
      expect(() => validateNodeType(123 as any)).toThrow('Node type must be a non-empty string');
      expect(() => validateNodeType(null as any)).toThrow('Node type must be a non-empty string');
      expect(() => validateNodeType(undefined as any)).toThrow('Node type must be a non-empty string');
    });

    it('should validate against schema when provided', () => {
      const schema: GraphSchema = {
        nodes: {
          Person: { properties: ['name', 'email'] },
          Company: { properties: ['name'] }
        },
        edges: {}
      };

      expect(() => validateNodeType('Person', schema)).not.toThrow();
      expect(() => validateNodeType('Company', schema)).not.toThrow();
    });

    it('should throw when node type not in schema', () => {
      const schema: GraphSchema = {
        nodes: {
          Person: { properties: ['name'] }
        },
        edges: {}
      };

      expect(() => validateNodeType('InvalidType', schema))
        .toThrow("Node type 'InvalidType' is not defined in schema");
    });
  });

  describe('validateEdgeType', () => {
    it('should accept valid edge type without schema', () => {
      expect(() => validateEdgeType('KNOWS')).not.toThrow();
      expect(() => validateEdgeType('WORKS_AT')).not.toThrow();
    });

    it('should throw on empty edge type', () => {
      expect(() => validateEdgeType('')).toThrow('Edge type must be a non-empty string');
    });

    it('should throw on non-string edge type', () => {
      expect(() => validateEdgeType(123 as any)).toThrow('Edge type must be a non-empty string');
      expect(() => validateEdgeType(null as any)).toThrow('Edge type must be a non-empty string');
      expect(() => validateEdgeType(undefined as any)).toThrow('Edge type must be a non-empty string');
    });

    it('should validate against schema when provided', () => {
      const schema: GraphSchema = {
        nodes: {},
        edges: {
          KNOWS: { from: 'Person', to: 'Person' },
          WORKS_AT: { from: 'Person', to: 'Company' }
        }
      };

      expect(() => validateEdgeType('KNOWS', schema)).not.toThrow();
      expect(() => validateEdgeType('WORKS_AT', schema)).not.toThrow();
    });

    it('should throw when edge type not in schema (line 25 coverage)', () => {
      const schema: GraphSchema = {
        nodes: {},
        edges: {
          KNOWS: { from: 'Person', to: 'Person' }
        }
      };

      expect(() => validateEdgeType('INVALID_EDGE', schema))
        .toThrow("Edge type 'INVALID_EDGE' is not defined in schema");
    });
  });

  describe('validateNodeProperties', () => {
    it('should accept valid properties object', () => {
      expect(() => validateNodeProperties('Person', { name: 'Alice' })).not.toThrow();
      expect(() => validateNodeProperties('Job', { title: 'Engineer', salary: 100000 })).not.toThrow();
    });

    it('should throw on non-object properties (line 38 coverage)', () => {
      expect(() => validateNodeProperties('Person', null as any))
        .toThrow('Properties must be an object');
      expect(() => validateNodeProperties('Person', undefined as any))
        .toThrow('Properties must be an object');
      expect(() => validateNodeProperties('Person', 'invalid' as any))
        .toThrow('Properties must be an object');
      expect(() => validateNodeProperties('Person', 123 as any))
        .toThrow('Properties must be an object');
    });

    it('should validate properties against schema', () => {
      const schema: GraphSchema = {
        nodes: {
          Person: { properties: ['name', 'email', 'age'] }
        },
        edges: {}
      };

      expect(() =>
        validateNodeProperties('Person', { name: 'Alice', email: 'alice@example.com' }, schema)
      ).not.toThrow();
    });

    it('should warn about undefined properties in schema (line 48 coverage)', () => {
      const schema: GraphSchema = {
        nodes: {
          Person: { properties: ['name', 'email'] }
        },
        edges: {}
      };

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      validateNodeProperties('Person', {
        name: 'Alice',
        email: 'alice@example.com',
        undefinedProp1: 'value1',
        undefinedProp2: 'value2'
      }, schema);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Node type 'Person' has undefined properties: undefinedProp1, undefinedProp2")
      );

      consoleWarnSpy.mockRestore();
    });

    it('should not warn when all properties are defined', () => {
      const schema: GraphSchema = {
        nodes: {
          Person: { properties: ['name', 'email'] }
        },
        edges: {}
      };

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      validateNodeProperties('Person', {
        name: 'Alice',
        email: 'alice@example.com'
      }, schema);

      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('validateEdgeRelationship', () => {
    it('should skip validation when no schema provided (lines 62-64 coverage)', () => {
      expect(() =>
        validateEdgeRelationship('KNOWS', 'Person', 'Person')
      ).not.toThrow();

      expect(() =>
        validateEdgeRelationship('WORKS_AT', 'Person', 'Company')
      ).not.toThrow();
    });

    it('should skip validation when schema has no edges (lines 62-64 coverage)', () => {
      const schema: GraphSchema = {
        nodes: {},
        edges: {}
      };

      expect(() =>
        validateEdgeRelationship('KNOWS', 'Person', 'Person', schema)
      ).not.toThrow();
    });

    it('should skip validation when edge type not in schema (lines 62-64 coverage)', () => {
      const schema: GraphSchema = {
        nodes: {},
        edges: {
          KNOWS: { from: 'Person', to: 'Person' }
        }
      };

      expect(() =>
        validateEdgeRelationship('WORKS_AT', 'Person', 'Company', schema)
      ).not.toThrow();
    });

    it('should validate "from" node type constraint (lines 68-72 coverage)', () => {
      const schema: GraphSchema = {
        nodes: {},
        edges: {
          WORKS_AT: { from: 'Person', to: 'Company' }
        }
      };

      expect(() =>
        validateEdgeRelationship('WORKS_AT', 'Person', 'Company', schema)
      ).not.toThrow();

      expect(() =>
        validateEdgeRelationship('WORKS_AT', 'Company', 'Company', schema)
      ).toThrow("Edge type 'WORKS_AT' requires 'from' node type 'Person', got 'Company'");
    });

    it('should validate "to" node type constraint (lines 74-78 coverage)', () => {
      const schema: GraphSchema = {
        nodes: {},
        edges: {
          WORKS_AT: { from: 'Person', to: 'Company' }
        }
      };

      expect(() =>
        validateEdgeRelationship('WORKS_AT', 'Person', 'Company', schema)
      ).not.toThrow();

      expect(() =>
        validateEdgeRelationship('WORKS_AT', 'Person', 'Person', schema)
      ).toThrow("Edge type 'WORKS_AT' requires 'to' node type 'Company', got 'Person'");
    });

    it('should validate both "from" and "to" constraints', () => {
      const schema: GraphSchema = {
        nodes: {},
        edges: {
          POSTED_BY: { from: 'Job', to: 'Company' }
        }
      };

      expect(() =>
        validateEdgeRelationship('POSTED_BY', 'Job', 'Company', schema)
      ).not.toThrow();

      expect(() =>
        validateEdgeRelationship('POSTED_BY', 'Person', 'Company', schema)
      ).toThrow("Edge type 'POSTED_BY' requires 'from' node type 'Job', got 'Person'");

      expect(() =>
        validateEdgeRelationship('POSTED_BY', 'Job', 'Person', schema)
      ).toThrow("Edge type 'POSTED_BY' requires 'to' node type 'Company', got 'Person'");
    });

    it('should accept edges with matching from and to types', () => {
      const schema: GraphSchema = {
        nodes: {},
        edges: {
          FOLLOWS: { from: 'Person', to: 'Person' }
        }
      };

      expect(() =>
        validateEdgeRelationship('FOLLOWS', 'Person', 'Person', schema)
      ).not.toThrow();
    });

    it('should handle multiple edge types in schema', () => {
      const schema: GraphSchema = {
        nodes: {},
        edges: {
          WORKS_AT: { from: 'Person', to: 'Company' },
          POSTED_BY: { from: 'Job', to: 'Company' },
          APPLIED_TO: { from: 'Person', to: 'Job' }
        }
      };

      expect(() =>
        validateEdgeRelationship('WORKS_AT', 'Person', 'Company', schema)
      ).not.toThrow();

      expect(() =>
        validateEdgeRelationship('POSTED_BY', 'Job', 'Company', schema)
      ).not.toThrow();

      expect(() =>
        validateEdgeRelationship('APPLIED_TO', 'Person', 'Job', schema)
      ).not.toThrow();

      // Verify constraints still enforced
      expect(() =>
        validateEdgeRelationship('WORKS_AT', 'Company', 'Person', schema)
      ).toThrow("Edge type 'WORKS_AT' requires 'from' node type 'Person', got 'Company'");
    });
  });

  describe('validateNodeId', () => {
    it('should accept valid positive integer IDs', () => {
      expect(() => validateNodeId(1)).not.toThrow();
      expect(() => validateNodeId(100)).not.toThrow();
      expect(() => validateNodeId(999999)).not.toThrow();
    });

    it('should throw on non-integer IDs', () => {
      expect(() => validateNodeId(1.5)).toThrow('Node ID must be a positive integer');
      expect(() => validateNodeId(3.14)).toThrow('Node ID must be a positive integer');
    });

    it('should throw on zero or negative IDs', () => {
      expect(() => validateNodeId(0)).toThrow('Node ID must be a positive integer');
      expect(() => validateNodeId(-1)).toThrow('Node ID must be a positive integer');
      expect(() => validateNodeId(-100)).toThrow('Node ID must be a positive integer');
    });

    it('should throw on non-number IDs', () => {
      expect(() => validateNodeId('1' as any)).toThrow('Node ID must be a positive integer');
      expect(() => validateNodeId(null as any)).toThrow('Node ID must be a positive integer');
      expect(() => validateNodeId(undefined as any)).toThrow('Node ID must be a positive integer');
    });
  });
});
