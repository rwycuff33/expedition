import Redux from 'redux'
import {RemotePlayEvent, RemotePlayEventBody, ClientID} from 'expedition-qdl/lib/remote/Events'
import {ClientBase} from 'expedition-qdl/lib/remote/Client'
import {NavigateAction, RemotePlayAction, ActionFn, ActionFnArgs} from './actions/ActionTypes'
import {local} from './actions/RemotePlay'
import * as Bluebird from 'bluebird'

export type BaseAction = (a: Object, dispatch: Redux.Dispatch<any>, dispatchLocal: Redux.Dispatch<any>, isRemote: boolean) => Redux.Action;

export function explodeActionFn(a: any) {
  // Takes function, returns a function that returns the self-reference to the function and the set of the function's args
  return (args: ActionFnArgs) => {
    return [a.name, a, args];
  }
}

// The base layer of the remote play network framework; handles
// web socket connections & reconnect policy.
export class RemotePlayClient extends ClientBase {
  private websocketURI: string;
  private sock: WebSocket;
  private statusTimer: number;
  private actionSet: {[name: string]: ActionFn<any>} = {};

  constructor(id: ClientID) {
    super(id);
  }

  setID(id: ClientID) {
    this.id = id;
  }

  // Connect asynchronously and reconnect as needed
  connect(websocketURI: string): Bluebird<{}> {
    return new Bluebird<{}>((resolve, reject) => {
      if (this.isConnected()) {
        this.disconnect();
      }
      this.websocketURI = websocketURI;
      this.sock = new WebSocket(this.websocketURI, 'expedition-remote-play-1.0');


      this.sock.onerror = (e: Event) => {
        this.handleMessage({client: this.id, event: {type: 'ERROR', error: 'Socket error: ' + e.toString()}});
      };
      this.sock.onmessage = (e: MessageEvent) => {
        this.handleMessage(JSON.parse(e.data));
      };

      let opened = false;
      this.sock.onclose = () => {
        // TODO: REXP reconnect
        console.log('Socket closed');
        if (!opened) {
          reject('Socket closed');
        }
      };

      this.sock.onopen = () => {
        opened = true;
        this.statusTimer = (setInterval(() => {
          if (this.sock.readyState !== this.sock.OPEN) {
            clearInterval(this.statusTimer);
            console.log('Stopped sending status; socket not open');
          }
          this.sendEvent({type: 'STATUS', status: {line: 0, waiting: false}});
        }, 5000)) as any;

        resolve();
      }
    });
  }

  isConnected(): boolean {
    return false;
  }

  disconnect() {
    this.sock.close();
  }

  sendEvent(e: any): void { // TODO: e: RemotePlayEventBody
    if (!this.sock || this.sock.readyState !== this.sock.OPEN) {
      return;
    }
    const event: RemotePlayEvent = {client: this.id, event: e};
    this.sock.send(JSON.stringify(event));
    console.log('Sent ' + e.type);
  }

  public registerModuleActions(module: any) {
    for (const e of Object.keys(module.exports)) {
      // Registered actions must be single-argument, named functions.
      if (typeof(module.exports[e]) !== 'function' || !module.exports[e].name || module.exports[e].length !== 1) {
        continue;
      }
      const f: (...args: any[])=>any = module.exports[e];
      this.actionSet[f.name] = f;
      module.exports[e] = explodeActionFn(e);
    }
  }

  public createActionMiddleware(): Redux.Middleware {
    return ({dispatch, getState}: Redux.MiddlewareAPI<any>) => (next: Redux.Dispatch<any>) => (action: any) => {
      if (!action) {
        next(action);
        return;
      }

      // If the action currently dispatched was dispatched from remote play,
      // let it pass through and don't broadcast it to other devices.
      // TODO: Get this to handle multiple async dispatches, probably by reimplementing redux-thunk.
      let nextAction: Redux.Action;
      if (action.type === 'REMOTE_PLAY_ACTION') {
        if (action.action) {
          // Unwrap if action is object-like
          next((action as any as RemotePlayAction).action);
        } else {
          // Call function if action is function-like
          const fn = this.actionSet[action.name];
          if (!fn) {
            console.log('Failed to find registered action ' + action.name);
          }
          fn(action.args, (a: Redux.Action) => {dispatch(local(a));}, true);
        }

        // Remote actions should never re-broadcast
        return;
      } else {
        if (action instanceof Array) {
          const [name, fn, args] = action;
          console.log('Action is array yo');
          const remoteArgs = fn(args, dispatch, (a: Redux.Action) => {dispatch(local(a));}, false);
          // TODO: Prevent sending if function name ends in _LOCAL_ONLY
          this.sendEvent({type: 'ACTION', name, args: remoteArgs});
          return;
        } else if (typeof(action) === 'function') {
          // TODO: Remove this once redux-thunk based actions are converted to the new format.
          action(dispatch, getState);
          return;
        } else {
          // Pass through generated actions.
          nextAction = next(action);
        }
      }

      if (!nextAction) {
        return;
      }

      switch(nextAction.type) {
        case 'NAVIGATE':
          const na = (nextAction as any as NavigateAction);
          if (na.to.name !== 'QUEST_CARD') {
            this.sendEvent({type: 'ACTION', action: JSON.stringify(na)});
          }
          break;
        case 'RETURN':
          this.sendEvent({type: 'ACTION', action: JSON.stringify(nextAction)});
          break;
        default:
          // By default, we don't broadcast actions. They must be opted in.
          break;
      }
      return;
    }
  }
}

// TODO: Proper device ID
let client: RemotePlayClient = null;
export function getRemotePlayClient(): RemotePlayClient {
  if (client !== null) {
    return client
  }
  client = new RemotePlayClient('test');
  return client;
}
