import asyncio
import os
from pathlib import Path
import traceback
from mcp import types as mcp_types

from src.core.mcp_coordinator import MCPCoordinator

async def main():
    # Get the absolute path to mcp.json
    current_dir = Path(__file__).parent.parent.parent  # Go up to project root
    config_path = current_dir / "mcp.json"
    
    async with MCPCoordinator(str(config_path)) as coordinator:
        # Coordinator is initialized, clients connected, tools discovered
        print("MCP Coordinator is ready.")
        
        print("\n--- Registered Tools ---")
        if not coordinator.tool_registry:
            print("No tools registered.")
        else:
            for name, entry in coordinator.tool_registry.items():
                print(f"Tool: {entry.qualified_name}")
                print(f"  Description: {entry.definition.description}")
                if entry.definition.inputSchema:
                    # Pretty print the schema if possible
                    try:
                        import json
                        schema_str = json.dumps(entry.definition.inputSchema, indent=2)
                        print(f"  Input Schema:\n{schema_str}")
                    except ImportError:
                        print(f"  Input Schema: {entry.definition.inputSchema}") # Fallback if json import fails
                else:
                    print("  Input Schema: None")
                print("-" * 10)
        print("--- End Registered Tools ---\n")
        
        # --- Test Tool Calls ---
        print("Testing tool calls...\n")

        # 1. Test memory:create_entities
        create_entities_tool_name = "memory:create_entities"
        if create_entities_tool_name in coordinator.tool_registry:
            print(f"Calling {create_entities_tool_name}...")
            try:
                # Define a simple test entity
                test_entity_data = {
                    "entities": [
                        {
                            "name": "TestEntity_123",
                            "entityType": "TestType",
                            "observations": ["Observation 1", "Random data point"]
                        }
                    ]
                }
                result = await coordinator.call_tool(create_entities_tool_name, arguments=test_entity_data)
                # Assuming success if no exception is raised, result object might be verbose
                print(f"Successfully called {create_entities_tool_name}.") 
            except Exception as e:
                print(f"Error calling {create_entities_tool_name}: {e}")
                traceback.print_exc()
        else:
            print(f"Tool {create_entities_tool_name} not found in registry.")
        
        # Give memory server a moment to process
        await asyncio.sleep(0.5)

        # 1a. Verify entity creation using memory:search_nodes
        search_nodes_tool_name = "memory:search_nodes"
        entity_name_to_search = "TestEntity_123"
        if search_nodes_tool_name in coordinator.tool_registry:
            try:
                print(f"Searching for entity '{entity_name_to_search}'...")
                result = await coordinator.call_tool(search_nodes_tool_name, arguments={"query": entity_name_to_search})
                # Parse and print names if found
                found_entities = []
                if result and result.content and isinstance(result.content[0], mcp_types.TextContent):
                    try:
                        import json
                        data = json.loads(result.content[0].text)
                        if isinstance(data.get('entities'), list):
                            found_entities = [item.get('name') for item in data['entities'] if item.get('name')]
                    except (json.JSONDecodeError, IndexError, AttributeError) as parse_err:
                        print(f"  Verification Error: Could not parse search result JSON: {parse_err}")
                
                if entity_name_to_search in found_entities:
                    print("Verification: Entity found via search.")
                elif found_entities: # Found something, but not the target
                    print(f"Verification: Found entities {found_entities}, but not '{entity_name_to_search}'.")
                else:
                    print("Verification: Entity NOT found via search.")
            except Exception as e:
                print(f"Error calling {search_nodes_tool_name}: {e}")
                traceback.print_exc()
        else:
            print(f"Tool {search_nodes_tool_name} not found in registry.")

        # 1b. Add observations using memory:add_observations
        add_obs_tool_name = "memory:add_observations"
        if add_obs_tool_name in coordinator.tool_registry:
            try:
                new_observations = {
                    "observations": [
                        {
                            "entityName": entity_name_to_search,
                            "contents": ["Observation 2 - Added later", "Another data point"]
                        }
                    ]
                }
                print(f"Adding observations to '{entity_name_to_search}'...")
                result = await coordinator.call_tool(add_obs_tool_name, arguments=new_observations)
                # Assuming success if no exception is raised
                print(f"Successfully called {add_obs_tool_name}.")
            except Exception as e:
                print(f"Error calling {add_obs_tool_name}: {e}")
                traceback.print_exc()
        else:
            print(f"Tool {add_obs_tool_name} not found in registry.")

        # Give memory server a moment to process
        await asyncio.sleep(0.5)

        # 1c. Verify added observations using memory:open_nodes
        open_nodes_tool_name = "memory:open_nodes"
        if open_nodes_tool_name in coordinator.tool_registry:
            try:
                print(f"Opening node '{entity_name_to_search}' to check observations...")
                result = await coordinator.call_tool(open_nodes_tool_name, arguments={"names": [entity_name_to_search]})
                # Parse and print observations clearly
                observations_list = []
                parsed_entity_name = None
                if result and result.content and isinstance(result.content[0], mcp_types.TextContent):
                    try:
                        import json
                        data = json.loads(result.content[0].text)
                        if isinstance(data.get('entities'), list) and len(data['entities']) > 0:
                            entity_data = data['entities'][0]
                            parsed_entity_name = entity_data.get('name')
                            observations_list = entity_data.get('observations', [])
                            if "Observation 2 - Added later" in observations_list:
                                obs_found = True
                    except (json.JSONDecodeError, IndexError, AttributeError) as parse_err:
                        print(f"  Verification Error: Could not parse open_nodes result JSON: {parse_err}")
                
                if parsed_entity_name:
                    print(f"Successfully opened node: {parsed_entity_name}")
                    print(f"  Observations: {observations_list}")
                else:
                    print(f"Could not retrieve node data for '{entity_name_to_search}'.")

                if obs_found:
                    print("Verification: Added observation found.")
                else:
                    print("Verification: Added observation NOT found.")
            except Exception as e:
                print(f"Error calling {open_nodes_tool_name}: {e}")
                traceback.print_exc()
        else:
            print(f"Tool {open_nodes_tool_name} not found in registry.")

        print("\nSkipping entity deletion to test persistence.")

        print("\n" + "-"*20 + "\n")

        print("Skipping filesystem:list_directory test.")
        
        print("\n--- End Test Tool Calls (Modified) ---\n")

        print("Work done. Exiting context...")
    # __aexit__ is automatically called here, cleaning up resources
    print("Coordinator has shut down.")

if __name__ == "__main__":
    asyncio.run(main())
