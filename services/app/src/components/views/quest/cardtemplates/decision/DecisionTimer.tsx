import Button from 'app/components/base/Button';
import {getStore} from 'app/Store';
import * as React from 'react';
import {ParserNode} from '../TemplateTypes';
import {extractDecision} from './Actions';
import {LeveledSkillCheck, StateProps as StatePropsBase} from './Types';

export interface StateProps extends StatePropsBase {
  roundTimeTotalMillis: number;
}

export interface DispatchProps {
  onSelect: (node: ParserNode, selected: LeveledSkillCheck, elapsedMillis: number) => any;
}

export interface Props extends StateProps, DispatchProps {}

export default class DecisionTimer extends React.Component<Props, {}> {
  public interval: any;
  public state: {startTimeMillis: number, timeRemaining: number};
  private showPersona: boolean;

  constructor(props: Props) {
    super(props);
    this.state = {startTimeMillis: Date.now(), timeRemaining: this.props.roundTimeTotalMillis};
    this.interval = setInterval(() => {
      this.setState({timeRemaining: this.props.roundTimeTotalMillis - (Date.now() - this.state.startTimeMillis)});
    }, 100);

    // Set on single evaluation
    this.showPersona = this.props.rng() > 0.5;
  }

  public onSelect(c: LeveledSkillCheck) {
    if (!this.interval) {
      return;
    }

    clearInterval(this.interval);
    this.interval = null;
    this.props.onSelect(this.props.node, c, Date.now() - this.state.startTimeMillis);
  }

  public componentWillUnmount() {
    // Multiplayer play may unmount this component without a touch event.
    // This makes sure our timer eventually stops.
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  public render() {
    const decision = extractDecision(this.props.node);
    let formattedTimer: string;
    const timeRemainingSec = this.state.timeRemaining / 1000;
    if (timeRemainingSec < 10 && timeRemainingSec > 0) {
      formattedTimer = timeRemainingSec.toFixed(1);
    } else {
      formattedTimer = timeRemainingSec.toFixed(0);
    }
    formattedTimer += 's';

    const questTheme = getStore().getState().quest.details.theme || 'base';
    const classes = ['no_icon', 'base_card', 'base_timer_card', 'card_theme_' + this.props.theme, 'quest_theme_' + questTheme];

    const checks = decision.leveledChecks.map((c: LeveledSkillCheck, i: number) => {
      return <Button key={i} onClick={() => this.onSelect(c)}>{c.requiredSuccesses} {(this.showPersona) ? c.persona : c.difficulty} {c.skill}</Button>;
    });

    return (
      <div className={classes.join(' ')}>
        <div className="value">{formattedTimer}</div>
        <div className="secondary">{checks}</div>
      </div>
    );
  }
}
